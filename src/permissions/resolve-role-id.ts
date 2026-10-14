// backend/src/permissions/resolve-role-id.ts
// Lote 8.1 — Resuelve Role.id desde (clubId, scope, name).
// Usado por servicios que crean ClubMember o MembershipRole.

import { NotFoundException } from '@nestjs/common'
import type { PrismaClient, Prisma } from '@prisma/client'
import type { ClubRoleName, TeamRoleName } from './role-name-maps'

type PrismaLike = Prisma.TransactionClient

export async function resolveClubRoleId(
  prisma: PrismaLike,
  clubId: string,
  name: ClubRoleName,
): Promise<string> {
  const role = await prisma.role.findUnique({
    where: { clubId_scope_name: { clubId, scope: 'CLUB', name } },
    select: { id: true },
  })
  if (!role) {
    throw new NotFoundException(
      `No existe el rol de club "${name}" para el club ${clubId}. ¿Falta el seed?`,
    )
  }
  return role.id
}

export async function resolveTeamRoleId(
  prisma: PrismaLike,
  clubId: string,
  name: TeamRoleName,
): Promise<string> {
  const role = await prisma.role.findUnique({
    where: { clubId_scope_name: { clubId, scope: 'TEAM', name } },
    select: { id: true },
  })
  if (!role) {
    throw new NotFoundException(
      `No existe el rol de equipo "${name}" para el club ${clubId}. ¿Falta el seed?`,
    )
  }
  return role.id
}

export async function resolveTeamRoleIdByTeamId(
  prisma: PrismaLike,
  teamId: string,
  name: TeamRoleName,
): Promise<string> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { clubId: true },
  })
  if (!team) throw new NotFoundException(`Equipo ${teamId} no encontrado`)
  return resolveTeamRoleId(prisma, team.clubId, name)
}