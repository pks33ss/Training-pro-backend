// backend/src/permissions/team-policy.service.ts
// Lote 8.2 — Reglas de negocio que NO son permisos puros.
// Ver docs/permissions.md §7.

import { Injectable } from '@nestjs/common'
import type { PrismaClient } from '@prisma/client'

type PrismaLike = PrismaClient

export const STAFF_TEAM_ROLES = ['COACH', 'ASSISTANT', 'ADMIN_TEAM'] as const

@Injectable()
export class TeamPolicyService {
  async isLastCoach(
    prisma: PrismaLike,
    teamId: string,
    targetUserId: string,
  ): Promise<boolean> {
    const targetIsCoach = await prisma.membershipRole.findFirst({
      where: {
        membership: { userId: targetUserId, teamId, status: 'ACTIVE' },
        roleRef: { name: 'COACH', scope: 'TEAM' },
      },
      select: { id: true },
    })
    if (!targetIsCoach) return false

    const coaches = await prisma.membershipRole.count({
      where: {
        membership: { teamId, status: 'ACTIVE' },
        roleRef: { name: 'COACH', scope: 'TEAM' },
      },
    })
    return coaches <= 1
  }

  canRemoveAllTargetRoles(
    actorCanRemove: string[],
    targetRoles: string[],
  ): boolean {
    if (targetRoles.length === 0) return false
    return targetRoles.every((r) => actorCanRemove.includes(r))
  }

  async syncClubMembershipAfterLeave(
    prisma: PrismaLike,
    userId: string,
    clubId: string,
  ): Promise<void> {
    const cm = await prisma.clubMember.findFirst({
      where: { userId, clubId },
      select: {
        id: true,
        isActive: true,
        roleRef: { select: { name: true } },
      },
    })
    if (!cm) return
    if (cm.roleRef.name === 'ADMIN_CLUB') return

    const activeCount = await prisma.teamMembership.count({
      where: { userId, status: 'ACTIVE', team: { clubId } },
    })

    if (activeCount === 0 && cm.isActive) {
      await prisma.clubMember.update({
        where: { id: cm.id },
        data: { isActive: false },
      })
    }
  }

  async ensureClubMemberForTeam(
    prisma: PrismaLike,
    userId: string,
    teamId: string,
  ): Promise<void> {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { clubId: true },
    })
    if (!team) return

    const existing = await prisma.clubMember.findFirst({
      where: { userId, clubId: team.clubId },
      select: { id: true, isActive: true },
    })

    if (existing) {
      if (!existing.isActive) {
        await prisma.clubMember.update({
          where: { id: existing.id },
          data: { isActive: true },
        })
      }
      return
    }

    const memberRole = await prisma.role.findUnique({
      where: {
        clubId_scope_name: {
          clubId: team.clubId,
          scope: 'CLUB',
          name: 'MEMBER',
        },
      },
      select: { id: true },
    })
    if (!memberRole) {
      throw new Error(
        `Rol MEMBER no existe para el club ${team.clubId}. Ejecuta el seed.`,
      )
    }

    await prisma.clubMember.create({
      data: {
        userId,
        clubId: team.clubId,
        role: 'MEMBER',
        roleId: memberRole.id,
        isActive: true,
      },
    })
  }
}