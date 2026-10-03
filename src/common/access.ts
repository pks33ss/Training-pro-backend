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
 *
 * Matriz:
 *   - SUPER_ADMIN / ADMIN_CLUB: todos
 *   - ADMIN_TEAM:               todos
 *   - COACH:                    PLAYER, COACH, ASSISTANT
 *   - ASSISTANT:                ninguno
 *   - PLAYER:                   ninguno
 *
 * Nota: además, un user siempre puede gestionarse sus propios roles.
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
 * Misma matriz que getAddableRoles.
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

// ─────────────────────────────────────────────
// GHOSTS
// ─────────────────────────────────────────────

/**
 * ¿Puede el actor editar los datos personales de este ghost?
 *
 * Reglas:
 *   - El target debe ser ghost (isGhost: true).
 *   - SUPER_ADMIN: siempre.
 *   - ADMIN_CLUB: si el ghost es miembro activo de su club.
 *   - COACH/ASSISTANT/ADMIN_TEAM: si el ghost es miembro activo de uno de sus equipos.
 */
export async function canEditGhost(
  prisma: PrismaLike,
  actorId: string,
  targetUserId: string,
): Promise<boolean> {
  // 1) El target debe ser ghost
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { isGhost: true, deletedAt: true },
  })
  if (!target || !target.isGhost || target.deletedAt) return false

  // 2) SUPER_ADMIN
  if (await isSuperAdmin(prisma, actorId)) return true

  // 3) Equipos donde el target es miembro activo
  const targetMemberships = await prisma.teamMembership.findMany({
    where: { userId: targetUserId, status: 'ACTIVE' },
    select: { teamId: true, team: { select: { clubId: true } } },
  })
  if (targetMemberships.length === 0) return false
  const teamIds = targetMemberships.map((m) => m.teamId)
  const clubIds = Array.from(new Set(targetMemberships.map((m) => m.team.clubId)))

  // 3a) ADMIN_CLUB de alguno de esos clubes
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

  // 3b) COACH/ASSISTANT/ADMIN_TEAM en alguno de esos equipos
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

/**
 * Devuelve la lista de teams verificados para el viewer.
 * Todos deben existir, estar accesibles y ser del MISMO deporte.
 * El primer teamId se considera el "principal".
 */
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

  // Verificar acceso a cada uno
  for (const t of teams) {
    if (!(await canViewTeam(prisma, userId, t.id))) {
      throw new ForbiddenException(`No tienes acceso al equipo ${t.id}`)
    }
  }

  // Verificar mismo deporte
  const sports = new Set(teams.map((t) => t.sport))
  if (sports.size > 1) {
    throw new ForbiddenException(
      'Solo se pueden combinar equipos del mismo deporte',
    )
  }

  // Ordenar según el orden de entrada para preservar "principal"
  const byId = new Map(teams.map((t) => [t.id, t]))
  return teamIds.map((id) => byId.get(id)!).filter(Boolean)
}

// ─────────────────────────────────────────────
// STATS CONFIG
// ─────────────────────────────────────────────

/**
 * ¿Puede el actor gestionar la configuración de visibilidad de stats
 * de este team? Misma regla que editar el team.
 */
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

/**
 * Rol efectivo del viewer sobre este team para filtrar stats.
 * Prioridad:
 *  1. SUPER_ADMIN          → ADMIN_TEAM
 *  2. ADMIN_CLUB del club  → ADMIN_TEAM
 *  3. Membership ACTIVE    → rol más alto (ADMIN_TEAM > COACH > ASSISTANT > PLAYER > VISITOR)
 *  4. Tutor activo         → VISITOR
 *  5. Default              → VISITOR
 */
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
      // 'VISITOR' no está en MembershipRoleValue, así que solo comprobamos
      // los que sí lo están.
      if (r === 'VISITOR') continue
      if (roles.includes(r as MembershipRoleValue)) return r
    }
    // Si por lo que sea solo tiene roles raros, caemos a VISITOR
    return 'VISITOR'
  }

  if (await isParentOfTeamMember(prisma, userId, teamId)) return 'VISITOR'

  return 'VISITOR'
}