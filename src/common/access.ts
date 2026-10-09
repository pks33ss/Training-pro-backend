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

/**
 * Recupera el team (con su club) tras verificar que el user tiene acceso.
 * Lanza NotFoundException si el team no existe, ForbiddenException si no
 * tiene acceso.
 */
export async function getTeamForViewer(
  prisma: PrismaLike,
  userId: string,
  teamId: string,
) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { club: true },
  })
  if (!team) throw new NotFoundException('Equipo no encontrado')

  if (!(await canViewTeam(prisma, userId, teamId))) {
    throw new ForbiddenException('No tienes acceso a este equipo')
  }

  return team
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

export async function getRemovableRoles(
  prisma: PrismaLike,
  actorId: string,
  teamId: string,
): Promise<MembershipRoleValue[]> {
  return getAddableRoles(prisma, actorId, teamId)
}

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

// ─────────────────────────────────────────────
// GHOSTS
// ─────────────────────────────────────────────

export async function canEditGhost(
  prisma: PrismaLike,
  actorId: string,
  targetUserId: string,
): Promise<boolean> {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { isGhost: true, deletedAt: true },
  })
  if (!target || !target.isGhost || target.deletedAt) return false

  if (await isSuperAdmin(prisma, actorId)) return true

  const targetMemberships = await prisma.teamMembership.findMany({
    where: { userId: targetUserId, status: 'ACTIVE' },
    select: { teamId: true, team: { select: { clubId: true } } },
  })
  if (targetMemberships.length === 0) return false
  const teamIds = targetMemberships.map((m) => m.teamId)
  const clubIds = Array.from(new Set(targetMemberships.map((m) => m.team.clubId)))

  const clubAdmin = await prisma.clubMember.findFirst({
    where: {
      userId: actorId,
      clubId: { in: clubIds },
      role: 'ADMIN_CLUB',
      isActive: true,
    },
    select: { id: true },
  })
  if (clubAdmin) return true

  const actorStaff = await prisma.teamMembership.findFirst({
    where: {
      userId: actorId,
      teamId: { in: teamIds },
      status: 'ACTIVE',
      roles: { some: { role: { in: STAFF_TEAM_ROLES } } },
    },
    select: { id: true },
  })
  return !!actorStaff
}

// ─────────────────────────────────────────────
// MULTI-TEAM
// ─────────────────────────────────────────────

export async function getTeamsForViewer(
  prisma: PrismaLike,
  userId: string,
  teamIds: string[],
) {
  if (teamIds.length === 0) {
    throw new ForbiddenException('No se han indicado equipos')
  }

  const teams = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    include: { club: true },
  })

  if (teams.length !== teamIds.length) {
    throw new NotFoundException('Alguno de los equipos no existe')
  }

  for (const t of teams) {
    if (!(await canViewTeam(prisma, userId, t.id))) {
      throw new ForbiddenException(`No tienes acceso al equipo ${t.id}`)
    }
  }

  const sports = new Set(teams.map((t) => t.sport))
  if (sports.size > 1) {
    throw new ForbiddenException(
      'Solo se pueden combinar equipos del mismo deporte',
    )
  }

  const byId = new Map(teams.map((t) => [t.id, t]))
  return teamIds.map((id) => byId.get(id)!).filter(Boolean)
}

// ─────────────────────────────────────────────
// STATS CONFIG
// ─────────────────────────────────────────────

export async function canManageStatsConfig(
  prisma: PrismaLike,
  actorId: string,
  teamId: string,
): Promise<boolean> {
  return canEditTeam(prisma, actorId, teamId)
}

// ─────────────────────────────────────────────
// STATS ROLE
// ─────────────────────────────────────────────

export type StatsAudienceRoleValue =
  | 'PLAYER'
  | 'COACH'
  | 'ASSISTANT'
  | 'ADMIN_TEAM'
  | 'VISITOR'

const ROLE_PRIORITY: StatsAudienceRoleValue[] = [
  'ADMIN_TEAM',
  'COACH',
  'ASSISTANT',
  'PLAYER',
  'VISITOR',
]

export async function resolveViewerStatsRole(
  prisma: PrismaLike,
  userId: string,
  teamId: string,
): Promise<StatsAudienceRoleValue> {
  if (await isSuperAdmin(prisma, userId)) return 'ADMIN_TEAM'

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { clubId: true },
  })
  if (!team) return 'VISITOR'

  if (await isClubAdmin(prisma, userId, team.clubId)) return 'ADMIN_TEAM'

  const roles = await getTeamRoles(prisma, userId, teamId)
  if (roles.length > 0) {
    for (const r of ROLE_PRIORITY) {
      if (r === 'VISITOR') continue
      if (roles.includes(r as MembershipRoleValue)) return r
    }
    return 'VISITOR'
  }

  if (await isParentOfTeamMember(prisma, userId, teamId)) return 'VISITOR'

  return 'VISITOR'
}

// ─────────────────────────────────────────────
// PLAYER PROFILE
// ─────────────────────────────────────────────

export async function canViewPlayerProfile(
  prisma: PrismaLike,
  viewerId: string,
  targetUserId: string,
): Promise<boolean> {
  if (viewerId === targetUserId) return true
  if (await isSuperAdmin(prisma, viewerId)) return true

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, deletedAt: true },
  })
  if (!target || target.deletedAt) return false

  const tutorRel = await prisma.tutorRelationship.findFirst({
    where: {
      tutorUserId: viewerId,
      playerUserId: targetUserId,
      status: 'ACTIVE',
    },
    select: { id: true },
  })
  if (tutorRel) return true

  const targetClubMemberships = await prisma.clubMember.findMany({
    where: { userId: targetUserId, isActive: true },
    select: { clubId: true },
  })
  const clubIds = targetClubMemberships.map((c) => c.clubId)

  const targetTeamMemberships = await prisma.teamMembership.findMany({
    where: { userId: targetUserId, status: 'ACTIVE' },
    select: { teamId: true },
  })
  const teamIds = targetTeamMemberships.map((m) => m.teamId)

  if (clubIds.length === 0 && teamIds.length === 0) return false

  if (clubIds.length > 0) {
    const clubAdmin = await prisma.clubMember.findFirst({
      where: {
        userId: viewerId,
        clubId: { in: clubIds },
        role: 'ADMIN_CLUB',
        isActive: true,
      },
      select: { id: true },
    })
    if (clubAdmin) return true
  }

  if (teamIds.length > 0) {
    const teamStaff = await prisma.teamMembership.findFirst({
      where: {
        userId: viewerId,
        teamId: { in: teamIds },
        status: 'ACTIVE',
        roles: {
          some: { role: { in: STAFF_TEAM_ROLES } },
        },
      },
      select: { id: true },
    })
    if (teamStaff) return true
  }

  return false
}

export async function canEditPlayerProfile(
  prisma: PrismaLike,
  viewerId: string,
  targetUserId: string,
): Promise<boolean> {
  if (await isSuperAdmin(prisma, viewerId)) return true

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, isGhost: true, deletedAt: true },
  })
  if (!target || target.deletedAt) return false

  if (viewerId === targetUserId) return true

  if (!target.isGhost) return false

  const targetClubMemberships = await prisma.clubMember.findMany({
    where: { userId: targetUserId, isActive: true },
    select: { clubId: true },
  })
  const clubIds = targetClubMemberships.map((c) => c.clubId)

  const targetTeamMemberships = await prisma.teamMembership.findMany({
    where: { userId: targetUserId, status: 'ACTIVE' },
    select: { teamId: true },
  })
  const teamIds = targetTeamMemberships.map((m) => m.teamId)

  if (clubIds.length === 0 && teamIds.length === 0) return false

  if (clubIds.length > 0) {
    const clubAdmin = await prisma.clubMember.findFirst({
      where: {
        userId: viewerId,
        clubId: { in: clubIds },
        role: 'ADMIN_CLUB',
        isActive: true,
      },
      select: { id: true },
    })
    if (clubAdmin) return true
  }

  if (teamIds.length > 0) {
    const teamStaff = await prisma.teamMembership.findFirst({
      where: {
        userId: viewerId,
        teamId: { in: teamIds },
        status: 'ACTIVE',
        roles: {
          some: { role: { in: STAFF_TEAM_ROLES } },
        },
      },
      select: { id: true },
    })
    if (teamStaff) return true
  }

  return false
}

export async function assertCanViewPlayerProfile(
  prisma: PrismaLike,
  viewerId: string,
  targetUserId: string,
): Promise<void> {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, deletedAt: true },
  })
  if (!target || target.deletedAt) {
    throw new NotFoundException('Usuario no encontrado')
  }

  if (!(await canViewPlayerProfile(prisma, viewerId, targetUserId))) {
    throw new ForbiddenException('No tienes acceso al perfil de este usuario')
  }
}

export async function assertCanEditPlayerProfile(
  prisma: PrismaLike,
  viewerId: string,
  targetUserId: string,
): Promise<void> {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, deletedAt: true },
  })
  if (!target || target.deletedAt) {
    throw new NotFoundException('Usuario no encontrado')
  }

  if (!(await canEditPlayerProfile(prisma, viewerId, targetUserId))) {
    throw new ForbiddenException(
      'No tienes permisos para editar el perfil de este usuario',
    )
  }
}

// ─────────────────────────────────────────────
// PAYMENTS
// ─────────────────────────────────────────────

/**
 * ¿Puede el actor gestionar (crear/editar/borrar) conceptos de pago
 * de este club?
 *
 * Reglas:
 *  - SUPER_ADMIN: siempre.
 *  - ADMIN_CLUB del club: sí.
 *  - COACH / ASSISTANT / ADMIN_TEAM de algún equipo del club: sí.
 */
export async function canManageClubPayments(
  prisma: PrismaLike,
  userId: string,
  clubId: string,
): Promise<boolean> {
  if (await isSuperAdmin(prisma, userId)) return true
  if (await isClubAdmin(prisma, userId, clubId)) return true

  const staffMembership = await prisma.teamMembership.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      team: { clubId },
      roles: {
        some: { role: { in: STAFF_TEAM_ROLES } },
      },
    },
    select: { id: true },
  })
  return !!staffMembership
}

/**
 * ¿Puede el actor ver un concepto de pago?
 *
 * Reglas:
 *  - Concepto de equipo (teamId != null): canViewTeam sobre el team.
 *  - Concepto de club (teamId == null):
 *      - SUPER_ADMIN, o
 *      - miembro activo del club, o
 *      - staff de algún equipo del club.
 */
export async function canViewPaymentConcept(
  prisma: PrismaLike,
  userId: string,
  concept: { clubId: string; teamId: string | null },
): Promise<boolean> {
  if (!concept.teamId) {
    if (await isSuperAdmin(prisma, userId)) return true
    if (await isActiveClubMember(prisma, userId, concept.clubId)) return true
    if (await canManageClubPayments(prisma, userId, concept.clubId)) return true
    return false
  }

  return canViewTeam(prisma, userId, concept.teamId)
}

/**
 * ¿Puede el actor gestionar (editar/borrar) un concepto de pago?
 *
 * Reglas:
 *  - Concepto de equipo (teamId != null): canEditTeam sobre el team.
 *  - Concepto de club (teamId == null): ADMIN_CLUB o SUPER_ADMIN.
 */
export async function canManagePaymentConcept(
  prisma: PrismaLike,
  userId: string,
  concept: { clubId: string; teamId: string | null },
): Promise<boolean> {
  if (!concept.teamId) {
    if (await isSuperAdmin(prisma, userId)) return true
    return isClubAdmin(prisma, userId, concept.clubId)
  }

  return canEditTeam(prisma, userId, concept.teamId)
}

/**
 * ¿Puede el actor ver el resumen de pagos?
 *
 * Reglas:
 *  - Si hay teamId: canViewTeam sobre el team.
 *  - Si hay clubId: miembro activo del club, o staff/admin.
 */
export async function canViewPaymentsSummary(
  prisma: PrismaLike,
  userId: string,
  filters: { clubId?: string | null; teamId?: string | null },
): Promise<boolean> {
  if (filters.teamId) {
    return canViewTeam(prisma, userId, filters.teamId)
  }

  if (filters.clubId) {
    if (await isSuperAdmin(prisma, userId)) return true
    if (await isActiveClubMember(prisma, userId, filters.clubId)) return true
    if (await canManageClubPayments(prisma, userId, filters.clubId)) return true
    return false
  }

  return false
}

/**
 * ¿Puede el actor borrar un pago concreto?
 *
 * Reglas:
 *  - SUPER_ADMIN: siempre.
 *  - ADMIN_CLUB del club del concepto: sí.
 *  - Staff del team del concepto: sí.
 *  - Creador del pago: sí (si aún puede ver el concepto).
 */
export async function canDeletePayment(
  prisma: PrismaLike,
  userId: string,
  paymentId: string,
): Promise<boolean> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      createdById: true,
      concept: { select: { clubId: true, teamId: true } },
    },
  })
  if (!payment) return false

  if (await isSuperAdmin(prisma, userId)) return true

  // ADMIN_CLUB del club del concepto
  if (await isClubAdmin(prisma, userId, payment.concept.clubId)) return true

  // Staff del team (si el concepto es de team)
  if (payment.concept.teamId) {
    if (await canEditTeam(prisma, userId, payment.concept.teamId)) return true
  }

  // Creador del pago (si aún puede ver el concepto)
  if (payment.createdById === userId) {
    if (
      await canViewPaymentConcept(prisma, userId, {
        clubId: payment.concept.clubId,
        teamId: payment.concept.teamId,
      })
    ) {
      return true
    }
  }

  return false
}

// ── ASSERTS ──

export async function assertCanViewPaymentConcept(
  prisma: PrismaLike,
  userId: string,
  concept: { clubId: string; teamId: string | null },
): Promise<void> {
  if (!(await canViewPaymentConcept(prisma, userId, concept))) {
    throw new ForbiddenException('No tienes acceso a este concepto de pago')
  }
}

export async function assertCanManagePaymentConcept(
  prisma: PrismaLike,
  userId: string,
  concept: { clubId: string; teamId: string | null },
): Promise<void> {
  if (!(await canManagePaymentConcept(prisma, userId, concept))) {
    if (!concept.teamId) {
      throw new ForbiddenException(
        'Solo los administradores del club pueden gestionar conceptos a nivel club',
      )
    }
    throw new ForbiddenException(
      'No tienes permisos para gestionar este concepto de pago',
    )
  }
}

export async function assertCanManageClubPayments(
  prisma: PrismaLike,
  userId: string,
  clubId: string,
): Promise<void> {
  if (!(await canManageClubPayments(prisma, userId, clubId))) {
    throw new ForbiddenException(
      'No tienes permisos para gestionar pagos de este club',
    )
  }
}

export async function assertCanDeletePayment(
  prisma: PrismaLike,
  userId: string,
  paymentId: string,
): Promise<void> {
  const exists = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true },
  })
  if (!exists) throw new NotFoundException('Pago no encontrado')

  if (!(await canDeletePayment(prisma, userId, paymentId))) {
    throw new ForbiddenException('No tienes permisos para borrar este pago')
  }
}