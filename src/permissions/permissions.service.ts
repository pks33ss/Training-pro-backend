// backend/src/permissions/permissions.service.ts
// Lote 4.C + 4.M.2 — Modelo de suma pura con overrides por equipo.
//
// Un usuario tiene N roles en el club (ClubMemberRole). Cada rol tiene:
//   - scope = 'ALL'   → aplica a todo el club.
//   - scope = 'TEAMS' → aplica solo a los equipos en `teamScopes`.
//
// Los permisos de un rol se resuelven así:
//   1. Defaults (RolePermission con teamId = null) → aplican a todos los equipos.
//   2. Overrides (RolePermission con teamId = <teamId>) → aplican solo a ese equipo.
//      El override GANA sobre el default (sea granted=true o granted=false).
//
// `can(userId, resource, action, { clubId, teamId })`:
//   1. SUPER_ADMIN → true
//   2. ADMIN_CLUB en ese club → true
//   3. Recopila los ClubMemberRole que aplican al contexto
//      (scope=ALL, o scope=TEAMS con teamId en teamScopes)
//   4. Para cada rol, aplica defaults + overrides
//   5. Si algún rol tiene (resource, action, granted=true) final → true
//   6. Si no → false

import { Injectable } from '@nestjs/common'
import type { PrismaClient } from '@prisma/client'
import type {
  PermissionAction,
  PermissionResource,
} from './permissions.constants'

type PrismaLike = PrismaClient

// ─────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────

export interface ApplicableRole {
  /** id del ClubMemberRole */
  clubMemberRoleId: string
  /** id del Role */
  roleId: string
  /** nombre del Role (MEMBER, ADMIN_CLUB, PLAYER, etc.) */
  roleName: string
  /** scope del ClubMemberRole: 'ALL' | 'TEAMS' */
  scope: 'ALL' | 'TEAMS'
  /** teamIds si scope = 'TEAMS' */
  teamIds: string[]
  /** permisos granted=true finales (defaults + overrides) de ese Role */
  permissions: Set<string> // "resource:action"
}

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

@Injectable()
export class PermissionsService {
  // ─────────────────────────────────────────────
  // Invalidación (sin caché por ahora; se puede añadir si hace falta)
  // ─────────────────────────────────────────────

  invalidateAll(): void {
    // No-op. Se puede añadir caché en el futuro.
  }

  invalidate(_userId: string, _clubId: string): void {
    // No-op. Se puede añadir caché en el futuro.
  }

  // ─────────────────────────────────────────────
  // Helpers básicos
  // ─────────────────────────────────────────────

  async isSuperAdmin(
    prisma: PrismaLike,
    userId: string,
  ): Promise<boolean> {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, deletedAt: true },
    })
    return !!u && u.role === 'SUPER_ADMIN' && u.deletedAt === null
  }

  /**
   * Devuelve los nombres de los roles de club del usuario en ese club.
   * (Puede tener varios.)
   */
  async getClubRoleNames(
    prisma: PrismaLike,
    userId: string,
    clubId: string,
  ): Promise<string[]> {
    const cm = await prisma.clubMember.findUnique({
      where: { userId_clubId: { userId, clubId } },
      select: {
        isActive: true,
        clubMemberRoles: {
          select: { roleRef: { select: { name: true } } },
        },
      },
    })
    if (!cm || !cm.isActive) return []
    return cm.clubMemberRoles.map((r) => r.roleRef.name)
  }

  /**
   * Devuelve true si el usuario tiene el rol `ADMIN_CLUB` en ese club.
   */
  async isClubAdmin(
    prisma: PrismaLike,
    userId: string,
    clubId: string,
  ): Promise<boolean> {
    const names = await this.getClubRoleNames(prisma, userId, clubId)
    return names.includes('ADMIN_CLUB')
  }

  // ─────────────────────────────────────────────
  // Roles aplicables al contexto
  // ─────────────────────────────────────────────

  /**
   * Devuelve los ClubMemberRole del usuario en el club que aplican
   * al contexto:
   *   - scope = 'ALL' → siempre.
   *   - scope = 'TEAMS' → solo si teamId está en teamScopes.
   *
   * Si `teamId` es null/undefined, solo devuelve los 'ALL'.
   *
   * Los permisos de cada rol se calculan con:
   *   1. Defaults (teamId = null) → aplican a todos los equipos.
   *   2. Overrides (teamId = <teamId>) → aplican solo a ese equipo.
   *      El override GANA sobre el default.
   *   3. Solo los que quedan granted = true.
   */
  async getApplicableRoles(
    prisma: PrismaLike,
    userId: string,
    clubId: string,
    teamId?: string | null,
  ): Promise<ApplicableRole[]> {
    const cm = await prisma.clubMember.findUnique({
      where: { userId_clubId: { userId, clubId } },
      select: {
        isActive: true,
        clubMemberRoles: {
          select: {
            id: true,
            scope: true,
            roleRef: {
              select: {
                id: true,
                name: true,
                permissions: {
                  select: {
                    resource: true,
                    action: true,
                    teamId: true,
                    granted: true,
                  },
                },
              },
            },
            teamScopes: { select: { teamId: true } },
          },
        },
      },
    })

    if (!cm || !cm.isActive) return []

    const result: ApplicableRole[] = []

    for (const cmr of cm.clubMemberRoles) {
      const isAll = cmr.scope === 'ALL'
      const isForTeam =
        cmr.scope === 'TEAMS' &&
        teamId != null &&
        cmr.teamScopes.some((ts) => ts.teamId === teamId)

      if (!isAll && !isForTeam) continue

      // 1) Defaults: teamId = null
      const map = new Map<string, boolean>()
      for (const p of cmr.roleRef.permissions) {
        if (p.teamId !== null) continue
        map.set(`${p.resource}:${p.action}`, p.granted)
      }

      // 2) Overrides: teamId = <teamId> (solo si teamId no es null)
      if (teamId) {
        for (const p of cmr.roleRef.permissions) {
          if (p.teamId !== teamId) continue
          map.set(`${p.resource}:${p.action}`, p.granted)
        }
      }

      // 3) Solo los granted = true
      const permissions = new Set<string>()
      for (const [k, v] of map) if (v) permissions.add(k)

      result.push({
        clubMemberRoleId: cmr.id,
        roleId: cmr.roleRef.id,
        roleName: cmr.roleRef.name,
        scope: cmr.scope as 'ALL' | 'TEAMS',
        teamIds: cmr.teamScopes.map((ts) => ts.teamId),
        permissions,
      })
    }

    return result
  }

  // ─────────────────────────────────────────────
  // `can` y `assert`
  // ─────────────────────────────────────────────

  /**
   * Comprueba si el usuario puede hacer `resource:action` en el contexto.
   *
   * - SUPER_ADMIN → true
   * - ADMIN_CLUB → true
   * - Suma de roles aplicables: si alguno tiene el permiso final → true
   * - Si no → false
   */
  async can(
    prisma: PrismaLike,
    userId: string,
    resource: PermissionResource,
    action: PermissionAction,
    opts: { clubId: string; teamId?: string | null },
  ): Promise<boolean> {
    // 1. SUPER_ADMIN
    if (await this.isSuperAdmin(prisma, userId)) return true

    // 2. ADMIN_CLUB
    if (await this.isClubAdmin(prisma, userId, opts.clubId)) return true

    // 3. Roles aplicables
    const roles = await this.getApplicableRoles(
      prisma,
      userId,
      opts.clubId,
      opts.teamId,
    )
    if (roles.length === 0) return false

    const key = `${resource}:${action}`
    return roles.some((r) => r.permissions.has(key))
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