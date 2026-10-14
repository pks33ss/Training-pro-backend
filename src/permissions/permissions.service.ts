// backend/src/permissions/permissions.service.ts
// Lote 8.2 — Resolución de permisos.
// Fuente de verdad: docs/permissions.md
//
// Reglas:
//   1. SUPER_ADMIN global → allow total.
//   2. ADMIN_CLUB del club → allow total.
//   3. Rol de club (ClubMember.roleRef): filas con scope null (club-wide).
//   4. Roles de equipo (MembershipRole): filas con scope "team:<id>".
//   5. Si no hay fila → deny (o defaults solo view si no hay ClubMember).
//
// Cache: por (userId, clubId), TTL 10s.

import { Injectable } from '@nestjs/common'
import type { PrismaClient, RoleScope } from '@prisma/client'
import {
  DEFAULT_VIEWABLE_RESOURCES,
  type PermissionAction,
  type PermissionResource,
} from './permissions.constants'
import { keyOf, type EffectivePermissions } from './permissions.types'

type PrismaLike = PrismaClient

interface Cached {
  expiresAt: number
  perms: EffectivePermissions
}

const CACHE_TTL_MS = 10_000

@Injectable()
export class PermissionsService {
  private cache = new Map<string, Cached>()

  private cacheKey(userId: string, clubId: string): string {
    return `${userId}::${clubId}`
  }

  invalidateAll(): void {
    this.cache.clear()
  }

  invalidate(userId: string, clubId: string): void {
    this.cache.delete(this.cacheKey(userId, clubId))
  }

  async isSuperAdmin(prisma: PrismaLike, userId: string): Promise<boolean> {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, deletedAt: true },
    })
    return !!u && u.role === 'SUPER_ADMIN' && u.deletedAt === null
  }

  async getClubRoleName(
    prisma: PrismaLike,
    userId: string,
    clubId: string,
  ): Promise<string | null> {
    const cm = await prisma.clubMember.findFirst({
      where: { userId, clubId, isActive: true },
      select: { roleRef: { select: { name: true } } },
    })
    return cm?.roleRef.name ?? null
  }

  async resolve(
    prisma: PrismaLike,
    userId: string,
    clubId: string,
  ): Promise<EffectivePermissions> {
    const k = this.cacheKey(userId, clubId)
    const hit = this.cache.get(k)
    if (hit && hit.expiresAt > Date.now()) return hit.perms

    const perms = await this.resolveUncached(prisma, userId, clubId)
    this.cache.set(k, { expiresAt: Date.now() + CACHE_TTL_MS, perms })
    return perms
  }

  private async resolveUncached(
    prisma: PrismaLike,
    userId: string,
    clubId: string,
  ): Promise<EffectivePermissions> {
    const result: EffectivePermissions = {
      clubWide: new Set(),
      perTeam: new Map(),
    }

    // 1) SUPER_ADMIN
    if (await this.isSuperAdmin(prisma, userId)) {
      this.grantAll(result)
      return result
    }

    // 2) Rol de club
    const clubRoleName = await this.getClubRoleName(prisma, userId, clubId)

    if (!clubRoleName) {
      for (const r of DEFAULT_VIEWABLE_RESOURCES) {
        result.clubWide.add(keyOf(r, 'view'))
      }
      return result
    }

    if (clubRoleName === 'ADMIN_CLUB') {
      this.grantAll(result)
      return result
    }

    // 3) Permisos del rol de club
    const clubRole = await prisma.role.findUnique({
      where: {
        clubId_scope_name: {
          clubId,
          scope: 'CLUB' as RoleScope,
          name: clubRoleName,
        },
      },
      select: {
        permissions: {
          select: {
            resource: true,
            action: true,
            scope: true,
            granted: true,
          },
        },
      },
    })

    if (clubRole) {
      this.applyRows(result, clubRole.permissions)
    }

    // 4) Permisos de roles de equipo (solo scope team:<id>)
    const teamRoles = await prisma.membershipRole.findMany({
      where: {
        membership: {
          userId,
          status: 'ACTIVE',
          team: { clubId },
        },
      },
      select: {
        membership: { select: { teamId: true } },
        roleRef: {
          select: {
            permissions: {
              select: {
                resource: true,
                action: true,
                scope: true,
                granted: true,
              },
            },
          },
        },
      },
    })

    for (const mr of teamRoles) {
      const teamId = mr.membership.teamId
      for (const row of mr.roleRef.permissions) {
        if (row.granted === false) continue
        const res = row.resource as PermissionResource
        const act = row.action as PermissionAction

        if (row.scope === null) {
          // scope club → aplica a club-wide (también cubre este team).
          result.clubWide.add(keyOf(res, act))
        } else if (row.scope.startsWith('team:')) {
          const scopedTeamId = row.scope.slice('team:'.length)
          if (scopedTeamId === teamId) {
            this.addToTeam(result, teamId, keyOf(res, act))
          }
        }
      }
    }

    return result
  }

  private grantAll(result: EffectivePermissions): void {
    const all: PermissionResource[] = [
      'team', 'member', 'invitation', 'membership_role', 'payment',
      'event', 'document', 'club_settings', 'club_branding', 'report',
      'role_admin', 'player_profile', 'stats_config',
      'user_private_data', 'ghost_edit',
    ]
    const acts: PermissionAction[] = ['view', 'create', 'edit', 'delete']
    for (const r of all) {
      for (const a of acts) result.clubWide.add(keyOf(r, a))
    }
  }

  private applyRows(
    result: EffectivePermissions,
    rows: { resource: string; action: string; scope: string | null; granted: boolean }[],
  ): void {
    for (const row of rows) {
      if (row.granted === false) continue
      const res = row.resource as PermissionResource
      const act = row.action as PermissionAction
      if (row.scope === null) {
        result.clubWide.add(keyOf(res, act))
      } else if (row.scope.startsWith('team:')) {
        const teamId = row.scope.slice('team:'.length)
        this.addToTeam(result, teamId, keyOf(res, act))
      }
    }
  }

  private addToTeam(
    result: EffectivePermissions,
    teamId: string,
    key: string,
  ): void {
    let s = result.perTeam.get(teamId)
    if (!s) {
      s = new Set()
      result.perTeam.set(teamId, s)
    }
    s.add(key)
  }

  async can(
    prisma: PrismaLike,
    userId: string,
    resource: PermissionResource,
    action: PermissionAction,
    opts: { clubId: string; teamId?: string | null },
  ): Promise<boolean> {
    const perms = await this.resolve(prisma, userId, opts.clubId)
    const k = keyOf(resource, action)
    if (opts.teamId) {
      const t = perms.perTeam.get(opts.teamId)
      if (t?.has(k)) return true
    }
    return perms.clubWide.has(k)
  }

  async assert(
    prisma: PrismaLike,
    userId: string,
    resource: PermissionResource,
    action: PermissionAction,
    opts: { clubId: string; teamId?: string | null; message?: string },
  ): Promise<void> {
    const ok = await this.can(prisma, userId, resource, action, opts)
    if (!ok) {
      const { ForbiddenException } = await import('@nestjs/common')
      throw new ForbiddenException(
        opts.message ?? 'No tienes permisos para esta acción',
      )
    }
  }
}