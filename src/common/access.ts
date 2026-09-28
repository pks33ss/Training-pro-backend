// backend/src/common/access.ts

import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

type PrismaLike = PrismaClient

export type MembershipRoleValue =
  | 'PLAYER'
  | 'COACH'
  | 'ASSISTANT'
  | 'ADMIN_TEAM'

export type ClubRoleValue =
  | 'ADMIN_CLUB'
  | 'COACH'
  | 'ASSISTANT'
  | 'MEMBER'

const STAFF_TEAM_ROLES: MembershipRoleValue[] = ['COACH', 'ASSISTANT', 'ADMIN_TEAM']

// ─────────────────────────────────────────────
// GLOBAL
// ─────────────────────────────────────────────

export async function isSuperAdmin(
  prisma: PrismaLike,
  userId: string,
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, deletedAt: true },
  })
  return !!user && user.role === 'SUPER_ADMIN' && user.deletedAt === null
}

export async function assertSuperAdmin(
  prisma: PrismaLike,
  userId: string,
): Promise<void> {
  if (!(await isSuperAdmin(prisma, userId))) {
    throw new ForbiddenException('Requiere permisos de super administrador')
  }
}

// ─────────────────────────────────────────────
// CLUB
// ─────────────────────────────────────────────

export async function getClubRole(
  prisma: PrismaLike,
  userId: string,
  clubId: string,
): Promise<ClubRoleValue | null> {
  const member = await prisma.clubMember.findFirst({
    where: { userId, clubId, isActive: true },
    select: { role: true },
  })
  return (member?.role as ClubRoleValue | undefined) ?? null
}

export async function isClubAdmin(
  prisma: PrismaLike,
  userId: string,
  clubId: string,
): Promise<boolean> {
  return (await getClubRole(prisma, userId, clubId)) === 'ADMIN_CLUB'
}

export async function isActiveClubMember(
  prisma: PrismaLike,
  userId: string,
  clubId: string,
): Promise<boolean> {
  return (await getClubRole(prisma, userId, clubId)) !== null
}

export async function canInviteToClub(
  prisma: PrismaLike,
  userId: string,
  clubId: string,
): Promise<boolean> {
  if (await isSuperAdmin(prisma, userId)) return true
  return isClubAdmin(prisma, userId, clubId)
}

// ─────────────────────────────────────────────
// TEAM
// ─────────────────────────────────────────────

export async function getTeamRoles(
  prisma: PrismaLike,
  userId: string,
  teamId: string,
): Promise<MembershipRoleValue[]> {
  const membership = await prisma.teamMembership.findFirst({
    where: { userId, teamId, status: 'ACTIVE' },
    select: {
      roles: { select: { role: true } },
    },
  })
  if (!membership) return []
  return membership.roles.map((r) => r.role as MembershipRoleValue)
}

async function isParentOfTeamMember(
  prisma: PrismaLike,
  userId: string,
  teamId: string,
): Promise<boolean> {
  const rel = await prisma.tutorRelationship.findFirst({
    where: {
      tutorUserId: userId,
      status: 'ACTIVE',
      playerUser: {
        memberships: {
          some: { teamId, status: 'ACTIVE' },
        },
      },
    },
    select: { id: true },
  })
  return !!rel
}

export async function canViewTeam(
  prisma: PrismaLike,
  userId: string,
  teamId: string,
): Promise<boolean> {
  if (await isSuperAdmin(prisma, userId)) return true

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { clubId: true },
  })
  if (!team) return false

  if (await isClubAdmin(prisma, userId, team.clubId)) return true

  const roles = await getTeamRoles(prisma, userId, teamId)
  if (roles.length > 0) return true

  if (await isParentOfTeamMember(prisma, userId, teamId)) return true

  return false
}

export async function canEditTeam(
  prisma: PrismaLike,
  userId: string,
  teamId: string,
): Promise<boolean> {
  if (await isSuperAdmin(prisma, userId)) return true

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { clubId: true },
  })
  if (!team) return false

  if (await isClubAdmin(prisma, userId, team.clubId)) return true

  const roles = await getTeamRoles(prisma, userId, teamId)
  return roles.some((r) => STAFF_TEAM_ROLES.includes(r))
}

export async function canManageMembers(
  prisma: PrismaLike,
  userId: string,
  teamId: string,
): Promise<boolean> {
  return canEditTeam(prisma, userId, teamId)
}

export async function canDeleteTeam(
  prisma: PrismaLike,
  userId: string,
  teamId: string,
): Promise<boolean> {
  if (await isSuperAdmin(prisma, userId)) return true

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { clubId: true },
  })
  if (!team) return false

  return isClubAdmin(prisma, userId, team.clubId)
}

/**
 * Roles que este actor puede AÑADIR a un miembro del equipo.
 *
 * Matriz:
 *   - SUPER_ADMIN / ADMIN_CLUB: todos
 *   - ADMIN_TEAM:               todos
 *   - COACH:                    PLAYER, COACH, ASSISTANT
 *   - ASSISTANT:                ninguno
 *   - PLAYER:                   ninguno
 *
 * Nota: además, un user siempre puede gestionarse sus propios roles.
 * Esa regla se evalúa en canAddRole/canRemoveRole, no aquí.
 */
export async function getAddableRoles(
  prisma: PrismaLike,
  actorId: string,
  teamId: string,
): Promise<MembershipRoleValue[]> {
  if (await isSuperAdmin(prisma, actorId)) {
    return ['PLAYER', 'ASSISTANT', 'COACH', 'ADMIN_TEAM']
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { clubId: true },
  })
  if (!team) return []

  if (await isClubAdmin(prisma, actorId, team.clubId)) {
    return ['PLAYER', 'ASSISTANT', 'COACH', 'ADMIN_TEAM']
  }

  const actorRoles = await getTeamRoles(prisma, actorId, teamId)

  if (actorRoles.includes('ADMIN_TEAM')) {
    return ['PLAYER', 'ASSISTANT', 'COACH', 'ADMIN_TEAM']
  }
  if (actorRoles.includes('COACH')) {
    return ['PLAYER', 'ASSISTANT', 'COACH']
  }
  return []
}

/**
 * Roles que este actor puede QUITAR a un miembro del equipo.
 * Misma matriz que getAddableRoles (añadir/quitar comparten permisos).
 */
export async function getRemovableRoles(
  prisma: PrismaLike,
  actorId: string,
  teamId: string,
): Promise<MembershipRoleValue[]> {
  return getAddableRoles(prisma, actorId, teamId)
}

/**
 * ¿Puede el actor añadir este rol a este target?
 *  - Auto-gestión: siempre permitido (el user se gestiona sus propios roles).
 *  - Resto: el rol debe estar en getAddableRoles(actor).
 */
export async function canAddRole(
  prisma: PrismaLike,
  actorId: string,
  targetUserId: string,
  teamId: string,
  role: MembershipRoleValue,
): Promise<boolean> {
  if (actorId === targetUserId) return true
  const addable = await getAddableRoles(prisma, actorId, teamId)
  return addable.includes(role)
}

/**
 * ¿Puede el actor quitar este rol a este target?
 *  - Auto-gestión: siempre permitido.
 *  - Resto: el rol debe estar en getRemovableRoles(actor).
 */
export async function canRemoveRole(
  prisma: PrismaLike,
  actorId: string,
  targetUserId: string,
  teamId: string,
  role: MembershipRoleValue,
): Promise<boolean> {
  if (actorId === targetUserId) return true
  const removable = await getRemovableRoles(prisma, actorId, teamId)
  return removable.includes(role)
}

/**
 * Quitar miembro de un equipo (leave / status LEFT).
 * Regla (relajada): cualquier actor con getRemovableRoles no vacío
 * o el propio user puede sacar a alguien del equipo.
 * NOTA: la regla del último COACH ya NO se aplica aquí (decisión P A).
 */
export async function canRemoveMember(
  prisma: PrismaLike,
  actorId: string,
  targetUserId: string,
  teamId: string,
): Promise<boolean> {
  if (actorId === targetUserId) return true

  const removable = await getRemovableRoles(prisma, actorId, teamId)
  if (removable.length === 0) return false

  const targetRoles = await getTeamRoles(prisma, targetUserId, teamId)
  if (targetRoles.length === 0) return false

  return targetRoles.every((r) => removable.includes(r))
}

// ─────────────────────────────────────────────
// ASSERT VARIANTS
// ─────────────────────────────────────────────

export async function assertCanViewTeam(
  prisma: PrismaLike,
  userId: string,
  teamId: string,
): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true },
  })
  if (!team) throw new NotFoundException('Equipo no encontrado')

  if (!(await canViewTeam(prisma, userId, teamId))) {
    throw new ForbiddenException('No tienes acceso a este equipo')
  }
}

export async function assertCanEditTeam(
  prisma: PrismaLike,
  userId: string,
  teamId: string,
): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true },
  })
  if (!team) throw new NotFoundException('Equipo no encontrado')

  if (!(await canEditTeam(prisma, userId, teamId))) {
    throw new ForbiddenException('No tienes permisos para editar este equipo')
  }
}

export async function assertCanManageMembers(
  prisma: PrismaLike,
  userId: string,
  teamId: string,
): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true },
  })
  if (!team) throw new NotFoundException('Equipo no encontrado')

  if (!(await canManageMembers(prisma, userId, teamId))) {
    throw new ForbiddenException('No tienes permisos para gestionar miembros de este equipo')
  }
}

export async function assertCanDeleteTeam(
  prisma: PrismaLike,
  userId: string,
  teamId: string,
): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true },
  })
  if (!team) throw new NotFoundException('Equipo no encontrado')

  if (!(await canDeleteTeam(prisma, userId, teamId))) {
    throw new ForbiddenException('No tienes permisos para eliminar este equipo')
  }
}

export async function assertCanRemoveMember(
  prisma: PrismaLike,
  actorId: string,
  targetUserId: string,
  teamId: string,
): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true },
  })
  if (!team) throw new NotFoundException('Equipo no encontrado')

  if (!(await canRemoveMember(prisma, actorId, targetUserId, teamId))) {
    throw new ForbiddenException('No tienes permisos para quitar a este miembro del equipo')
  }
}

// ─────────────────────────────────────────────
// USER
// ─────────────────────────────────────────────

export async function canViewUserPrivateData(
  prisma: PrismaLike,
  actorId: string,
  targetUserId: string,
): Promise<boolean> {
  if (actorId === targetUserId) return true
  if (await isSuperAdmin(prisma, actorId)) return true

  const isParent = await prisma.tutorRelationship.findFirst({
    where: {
      tutorUserId: actorId,
      playerUserId: targetUserId,
      status: 'ACTIVE',
    },
    select: { id: true },
  })
  if (isParent) return true

  const targetTeams = await prisma.teamMembership.findMany({
    where: { userId: targetUserId, status: 'ACTIVE' },
    select: { teamId: true },
  })
  if (targetTeams.length === 0) return false
  const teamIds = targetTeams.map((t) => t.teamId)

  const actorStaff = await prisma.teamMembership.findFirst({
    where: {
      userId: actorId,
      teamId: { in: teamIds },
      status: 'ACTIVE',
      roles: { some: { role: { in: STAFF_TEAM_ROLES } } },
    },
    select: { id: true },
  })
  if (actorStaff) return true

  const teams = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    select: { clubId: true },
  })
  const clubIds = Array.from(new Set(teams.map((t) => t.clubId)))
  const adminClub = await prisma.clubMember.findFirst({
    where: { userId: actorId, clubId: { in: clubIds }, role: 'ADMIN_CLUB', isActive: true },
    select: { id: true },
  })
  return !!adminClub
}

export async function canEditUser(
  prisma: PrismaLike,
  actorId: string,
  targetUserId: string,
): Promise<boolean> {
  if (actorId === targetUserId) return true
  return isSuperAdmin(prisma, actorId)
}

export async function canDeleteUser(
  prisma: PrismaLike,
  actorId: string,
  targetUserId: string,
): Promise<boolean> {
  if (actorId === targetUserId) return true
  return isSuperAdmin(prisma, actorId)
}

export async function assertCanEditUser(
  prisma: PrismaLike,
  actorId: string,
  targetUserId: string,
): Promise<void> {
  if (!(await canEditUser(prisma, actorId, targetUserId))) {
    throw new ForbiddenException('No tienes permisos para editar este usuario')
  }
}

export async function assertCanDeleteUser(
  prisma: PrismaLike,
  actorId: string,
  targetUserId: string,
): Promise<void> {
  if (!(await canDeleteUser(prisma, actorId, targetUserId))) {
    throw new ForbiddenException('No tienes permisos para eliminar este usuario')
  }
}