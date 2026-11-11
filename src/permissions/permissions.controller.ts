// backend/src/permissions/permissions.controller.ts
// Lote 4.C + 4.D — Endpoint de permisos del usuario actual.
// OPTIMIZADO: una sola llamada a getApplicableRoles por nivel (club + cada equipo),
// el resto en memoria. ~5 + N queries (N = número de equipos del club).

import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { PrismaService } from '../prisma/prisma.service'
import { PermissionsService } from './permissions.service'
import {
  PERMISSION_RESOURCES,
  PERMISSION_ACTIONS,
} from './permissions.constants'
import { keyOf } from './permissions.types'

@Controller('clubs/:clubId/permissions')
@UseGuards(AuthGuard)
export class PermissionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get('me')
  async me(@Request() req, @Param('clubId') clubId: string) {
    const userId = req.user.id

    // 1. Flags
    const isSuperAdmin = await this.permissionsService.isSuperAdmin(
      this.prisma,
      userId,
    )
    const isClubAdmin = await this.permissionsService.isClubAdmin(
      this.prisma,
      userId,
      clubId,
    )

    // 2. Roles de club
    const clubRoleNames = await this.permissionsService.getClubRoleNames(
      this.prisma,
      userId,
      clubId,
    )

    // 3. Roles aplicables a nivel club (teamId = null)
    const rolesAtClubLevel = await this.permissionsService.getApplicableRoles(
      this.prisma,
      userId,
      clubId,
      null,
    )
    const clubPermissions = new Set<string>()
    for (const r of rolesAtClubLevel) {
      for (const k of r.permissions) clubPermissions.add(k)
    }

    // 4. Equipos del club
    const teams = await this.prisma.team.findMany({
      where: { clubId },
      select: { id: true },
    })

    // 5. Roles aplicables por equipo
    const teamPermissionsById = new Map<string, Set<string>>()
    for (const t of teams) {
      const rolesAtTeamLevel =
        await this.permissionsService.getApplicableRoles(
          this.prisma,
          userId,
          clubId,
          t.id,
        )
      const set = new Set<string>()
      for (const r of rolesAtTeamLevel) {
        for (const k of r.permissions) set.add(k)
      }
      teamPermissionsById.set(t.id, set)
    }

    // 6. canClub / canByTeam
    const canClub: Record<string, boolean> = {}
    const canByTeam: Record<string, Record<string, boolean>> = {}

    const bypass = isSuperAdmin || isClubAdmin

    for (const r of PERMISSION_RESOURCES) {
      for (const a of PERMISSION_ACTIONS) {
        const k = keyOf(r, a)
        canClub[k] = bypass ? true : clubPermissions.has(k)
      }
    }
    for (const t of teams) {
      canByTeam[t.id] = {}
      const set = teamPermissionsById.get(t.id) ?? new Set<string>()
      for (const r of PERMISSION_RESOURCES) {
        for (const a of PERMISSION_ACTIONS) {
          const k = keyOf(r, a)
          canByTeam[t.id][k] = bypass ? true : set.has(k)
        }
      }
    }

    // 7. Roles de equipo (por equipo)
    const teamRoles: Record<string, string[]> = {}
    const cm = await this.prisma.clubMember.findUnique({
      where: { userId_clubId: { userId, clubId } },
      select: {
        clubMemberRoles: {
          where: { scope: 'TEAMS' },
          select: {
            roleRef: { select: { name: true } },
            teamScopes: { select: { teamId: true } },
          },
        },
      },
    })
    if (cm) {
      for (const cmr of cm.clubMemberRoles) {
        for (const ts of cmr.teamScopes) {
          if (!teamRoles[ts.teamId]) teamRoles[ts.teamId] = []
          if (!teamRoles[ts.teamId].includes(cmr.roleRef.name)) {
            teamRoles[ts.teamId].push(cmr.roleRef.name)
          }
        }
      }
    }

    // 8. Compatibilidad con frontend viejo
    const clubWide = Array.from(clubPermissions)
    const perTeam: Record<string, string[]> = {}
    for (const [teamId, set] of teamPermissionsById.entries()) {
      perTeam[teamId] = Array.from(set)
    }
    const matrix: Record<string, Record<string, boolean>> = {}
    for (const r of PERMISSION_RESOURCES) {
      matrix[r] = {}
      for (const a of PERMISSION_ACTIONS) {
        matrix[r][a] = canClub[keyOf(r, a)] ?? false
      }
    }

    return {
      clubId,
      userId,
      clubRoleNames,
      teamRoles,
      flags: { isSuperAdmin, isClubAdmin },
      canClub,
      canByTeam,
      clubWide,
      perTeam,
      matrix,
      clubRoleName: clubRoleNames[0] ?? null,
      isClubAdmin,
    }
  }
}