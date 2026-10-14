// backend/src/permissions/resolve-role-id.ts
// Lote 8.7 C.3 — Resuelve Role.id desde (clubId, scope, name).
// Usado por servicios que crean ClubMember o MembershipRole.
//
// NOTA: ya no dependemos de un enum legacy. Aceptamos cualquier string
// como nombre de rol y validamos contra la BD.

import { NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'

type PrismaLike = Prisma.TransactionClient

export type RoleScope = 'CLUB' | 'TEAM'

export async function resolveRoleIdByName(
  prisma: PrismaLike,
  clubId: string,
  scope: RoleScope,
  name: string,
): Promise<string> {
  const role = await prisma.role.findUnique({
    where: { clubId_scope_name: { clubId, scope, name } },
    select: { id: true },
  })
  if (!role) {
    throw new NotFoundException(
      `No existe el rol "${name}" (${scope}) para el club ${clubId}. ¿Falta el seed?`,
    )
  }
  return role.id
}

/** Alias de conveniencia para roles de club. */
export async function resolveClubRoleId(
  prisma: PrismaLike,
  clubId: string,
  name: string,
): Promise<string> {
  return resolveRoleIdByName(prisma, clubId, 'CLUB', name)
}

/** Alias de conveniencia para roles de equipo. */
export async function resolveTeamRoleId(
  prisma: PrismaLike,
  clubId: string,
  name: string,
): Promise<string> {
  return resolveRoleIdByName(prisma, clubId, 'TEAM', name)
}

/** Resuelve el roleId a partir del teamId. */
export async function resolveTeamRoleIdByTeamId(
  prisma: PrismaLike,
  teamId: string,
  name: string,
): Promise<string> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { clubId: true },
  })
  if (!team) throw new NotFoundException(`Equipo ${teamId} no encontrado`)
  return resolveTeamRoleId(prisma, team.clubId, name)
}