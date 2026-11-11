// backend/src/permissions/seed-roles.ts
// Lote 4.B — Seed de roles de sistema.
//
// Modelo: un único catálogo de roles. La asignación (ClubMemberRole)
// decide si aplica a todo el club (`scope = 'ALL'`) o solo a ciertos
// equipos (`scope = 'TEAMS'`). El rol en sí no tiene ámbito.
//
// Cambios respecto al seed viejo (Lote 8.1 + 8.5):
//   - MEMBER: sin `event:view`.
//   - COACH y ASSISTANT de club: eliminados del catálogo.
//   - `user_private_data` + `ghost_edit` → `user_data`.
//   - PLAYER: solo `team:view`, `event:view`, `player_profile:view`
//     (antes tenía 14 permisos por un bug del seed viejo).
//   - Resto: sin cambios.

import type { Prisma } from '@prisma/client'

type PrismaLike = Prisma.TransactionClient

type Resource =
  | 'team' | 'member' | 'invitation' | 'membership_role' | 'payment'
  | 'session' | 'match' | 'attendance' | 'season' // ✅ NUEVOS
  | 'event' | 'library' | 'document'
  | 'club_settings' | 'club_branding' 
  | 'stats' | 'report'
  | 'role_admin' | 'player_profile' | 'stats_config' | 'user_data'
  | 'ghost_edit'

type Action = 'view' | 'create' | 'edit' | 'delete'
interface Perm { resource: Resource; action: Action }

const P = (resource: Resource, ...actions: Action[]): Perm[] =>
  actions.map((action) => ({ resource, action }))

// ─────────────────────────────────────────────
// CLUB
// ─────────────────────────────────────────────

const ADMIN_CLUB_PERMS: Perm[] = [] // bypass en código

const MEMBER: Perm[] = [
  ...P('team', 'view'),
]

const TESORERO: Perm[] = [
  ...P('payment', 'view', 'create', 'edit', 'delete'),
  ...P('member', 'view'),           // mantener (decisión)
  ...P('stats', 'view'),
  ...P('user_data', 'view'),        // antes user_private_data:view
]

const SECRETARIO: Perm[] = [
  ...P('member', 'view', 'create', 'edit'),
  ...P('document', 'view', 'create', 'edit', 'delete'),
  ...P('club_settings', 'view'),
  ...P('stats', 'view'),
  ...P('user_data', 'view', 'edit'), // antes user_private_data:view + ghost_edit:edit
]

const COORDINADOR: Perm[] = [
  ...P('team', 'view', 'create', 'edit'),
  ...P('member', 'view', 'create', 'edit', 'delete'),
  ...P('invitation', 'view', 'create', 'delete'),
  ...P('membership_role', 'view', 'create', 'delete'),
  ...P('event', 'view', 'create', 'edit', 'delete'),
    ...P('session', 'view', 'create', 'edit', 'delete'),
  ...P('match', 'view', 'create', 'edit', 'delete'),
  ...P('document', 'view', 'create', 'edit', 'delete'),
  ...P('stats', 'view'),
  ...P('player_profile', 'view', 'edit'),
  ...P('stats_config', 'view', 'edit'),
  ...P('user_data', 'view', 'edit'), // antes user_private_data:view + ghost_edit:edit
]

const DIRECTOR_DEPORTIVO: Perm[] = [
  ...P('team', 'view', 'create', 'edit'),
  ...P('member', 'view', 'create', 'edit', 'delete'),
  ...P('invitation', 'view', 'create', 'delete'),
  ...P('membership_role', 'view', 'create', 'delete'),
  ...P('event', 'view', 'create', 'edit', 'delete'),
    ...P('session', 'view', 'create', 'edit', 'delete'),
  ...P('match', 'view', 'create', 'edit', 'delete'),
  ...P('document', 'view', 'create', 'edit', 'delete'),
  ...P('stats', 'view'),
  ...P('player_profile', 'view', 'edit'),
  ...P('stats_config', 'view', 'edit'),
  ...P('user_data', 'view', 'edit'), // antes user_private_data:view + ghost_edit:edit
  ...P('payment', 'view'),
  ...P('role_admin', 'view'),
]

const OJEADOR: Perm[] = [
  ...P('team', 'view'),
  ...P('member', 'view'),
  ...P('event', 'view'),
    ...P('session', 'view'),
  ...P('match', 'view'),
  ...P('document', 'view'),
  ...P('stats', 'view'),
  ...P('player_profile', 'view'),
  ...P('stats_config', 'view'),
]

// ─────────────────────────────────────────────
// TEAM
// ─────────────────────────────────────────────

const PLAYER: Perm[] = [
  ...P('team', 'view'),
  ...P('event', 'view'),
    ...P('session', 'view'),
  ...P('match', 'view'),
  ...P('player_profile', 'view'),
]

const COACH: Perm[] = [
  ...P('team', 'view', 'edit'),
  ...P('member', 'view', 'create', 'edit', 'delete'),
  ...P('invitation', 'view', 'create', 'delete'),
  ...P('membership_role', 'view', 'create', 'delete'),
    ...P('session', 'view', 'create', 'edit', 'delete'), // ✅ Nuevo
  ...P('match', 'view', 'create', 'edit', 'delete'),   // ✅ Nuevo
  ...P('attendance', 'view', 'create', 'edit', 'delete'), // ✅ Nuevo
  ...P('season', 'view', 'create', 'edit', 'delete'),  // ✅ Nuevo
  ...P('event', 'view', 'create', 'edit', 'delete'),
    ...P('library', 'view', 'create', 'edit', 'delete'), // antes document
  ...P('document', 'view', 'create', 'edit', 'delete'), 
  ...P('player_profile', 'view', 'edit'),
  ...P('stats_config', 'view', 'edit'),
  ...P('user_data', 'view', 'edit'), // antes user_private_data:view + ghost_edit:edit
  ...P('stats', 'view'), // antes report
]

const ASSISTANT: Perm[] = [
  ...P('team', 'view'),
  ...P('member', 'view', 'create', 'edit'),
  ...P('invitation', 'view', 'create'),
  ...P('membership_role', 'view', 'create'),
    ...P('session', 'view', 'create', 'edit'), // ✅ Nuevo
  ...P('match', 'view', 'create', 'edit'),   // ✅ Nuevo
  ...P('attendance', 'view', 'create', 'edit'), // ✅ Nuevo
  ...P('season', 'view', 'create', 'edit'),  // ✅ Nuevo
  ...P('event', 'view', 'create', 'edit'),
    ...P('session', 'view', 'create', 'edit'),
  ...P('match', 'view', 'create', 'edit'),
    ...P('library', 'view', 'create'), // antes document
  ...P('document', 'view', 'create', 'edit', 'delete'), 
  ...P('player_profile', 'view'),
  ...P('stats_config', 'view'),
  ...P('stats', 'view'), // antes report
]

const ADMIN_TEAM: Perm[] = [
  ...P('team', 'view', 'edit'),
  ...P('member', 'view', 'create', 'edit', 'delete'),
  ...P('invitation', 'view', 'create', 'delete'),
  ...P('membership_role', 'view', 'create', 'delete'),
  
  ...P('event', 'view', 'create', 'edit', 'delete'),
    ...P('session', 'view', 'create', 'edit', 'delete'),
  ...P('match', 'view', 'create', 'edit', 'delete'),
  ...P('document', 'view', 'create', 'edit', 'delete'),
  ...P('player_profile', 'view', 'edit'),
  ...P('stats_config', 'view', 'edit'),
  ...P('user_data', 'view', 'edit'), // antes user_private_data:view + ghost_edit:edit
  ...P('club_settings', 'view', 'edit'), // mantener (decisión)
  ...P('role_admin', 'view', 'create', 'edit', 'delete'), // mantener (decisión)
    ...P('library', 'view', 'create', 'edit', 'delete'),
  ...P('document', 'view', 'create', 'edit', 'delete'), 
  ...P('stats', 'view'),
]

const DELEGADO: Perm[] = [
  ...P('team', 'view'),
  ...P('member', 'view'),
  ...P('invitation', 'view'),
  ...P('event', 'view'),
    ...P('session', 'view'),
  ...P('match', 'view'),
  ...P('document', 'view'),
  ...P('player_profile', 'view'),
]

const FISIO: Perm[] = [
  ...P('team', 'view'),
  ...P('member', 'view'),
  ...P('event', 'view'),        // ✅ Añadido para que pueda ver el dashboard/calendario
  ...P('session', 'view'),      // ✅ Añadido
  ...P('match', 'view'),        // ✅ Añadido
  ...P('attendance', 'view'),   // ✅ Añadido
  ...P('season', 'view'),       // ✅ Añadido
  ...P('stats', 'view'),        // ✅ Añadido (o 'report' si tu backend usa report)
  ...P('player_profile', 'view', 'edit'),
  ...P('stats_config', 'view'),
  ...P('user_data', 'view'),
]

const ENTRENADOR_VISITANTE: Perm[] = [
  ...P('team', 'view'),
  ...P('member', 'view'),
  ...P('membership_role', 'view'),
  ...P('event', 'view'),
    ...P('session', 'view'),
  ...P('match', 'view'),
  ...P('document', 'view'),
  ...P('player_profile', 'view'),
  ...P('stats_config', 'view'),
]

// ─────────────────────────────────────────────
// CATÁLOGO
// ─────────────────────────────────────────────

interface SystemRoleDef {
  scope: 'CLUB' | 'TEAM'
  name: string
  description: string
  isDefault: boolean
  perms: Perm[]
}

const SYSTEM_ROLES: SystemRoleDef[] = [
  // ── Roles de CLUB ──
  { scope: 'CLUB', name: 'ADMIN_CLUB', description: 'Administrador del club (bypass total)', isDefault: false, perms: ADMIN_CLUB_PERMS },
  { scope: 'CLUB', name: 'MEMBER', description: 'Miembro/socio del club', isDefault: true, perms: MEMBER },
  { scope: 'CLUB', name: 'TESORERO', description: 'Gestiona pagos y cuotas del club', isDefault: false, perms: TESORERO },
  { scope: 'CLUB', name: 'SECRETARIO', description: 'Documentación y altas/bajas', isDefault: false, perms: SECRETARIO },
  { scope: 'CLUB', name: 'COORDINADOR', description: 'Coordina todas las categorías del club', isDefault: false, perms: COORDINADOR },
  { scope: 'CLUB', name: 'DIRECTOR_DEPORTIVO', description: 'Dirección deportiva del club', isDefault: false, perms: DIRECTOR_DEPORTIVO },
  { scope: 'CLUB', name: 'OJEADOR', description: 'Solo lectura de perfiles y estadísticas', isDefault: false, perms: OJEADOR },

  // ── Roles de EQUIPO ──
  { scope: 'TEAM', name: 'PLAYER', description: 'Jugador', isDefault: true, perms: PLAYER },
  { scope: 'TEAM', name: 'COACH', description: 'Entrenador de equipo', isDefault: false, perms: COACH },
  { scope: 'TEAM', name: 'ASSISTANT', description: 'Ayudante de equipo', isDefault: false, perms: ASSISTANT },
  { scope: 'TEAM', name: 'ADMIN_TEAM', description: 'Administrador de equipo', isDefault: false, perms: ADMIN_TEAM },
  { scope: 'TEAM', name: 'DELEGADO', description: 'Logística del equipo', isDefault: false, perms: DELEGADO },
  { scope: 'TEAM', name: 'FISIO', description: 'Fisioterapeuta del equipo', isDefault: false, perms: FISIO },
  { scope: 'TEAM', name: 'ENTRENADOR_VISITANTE', description: 'Ve el equipo sin poder editar', isDefault: false, perms: ENTRENADOR_VISITANTE },
]

// ─────────────────────────────────────────────
// API PÚBLICA
// ─────────────────────────────────────────────

export function getSystemRoleDefinitions(): SystemRoleDef[] {
  return SYSTEM_ROLES
}

export async function seedSystemRolesForClub(
  prisma: PrismaLike,
  clubId: string,
): Promise<void> {
  const existingRoles = await prisma.role.findMany({
    where: { clubId },
    select: { id: true, scope: true, name: true },
  })
  const existingMap = new Map(
    existingRoles.map((r) => [`${r.scope}::${r.name}`, r.id]),
  )

  const rolesToCreate = SYSTEM_ROLES.filter(
    (def) => !existingMap.has(`${def.scope}::${def.name}`),
  )

  if (rolesToCreate.length > 0) {
    await prisma.role.createMany({
      data: rolesToCreate.map((def) => ({
        clubId,
        scope: def.scope,
        name: def.name,
        description: def.description,
        isSystem: true,
        isDefault: def.isDefault,
      })),
      skipDuplicates: true,
    })
  }

  const allRoles = await prisma.role.findMany({
    where: { clubId },
    select: { id: true, scope: true, name: true },
  })
  const roleIdByKey = new Map(
    allRoles.map((r) => [`${r.scope}::${r.name}`, r.id]),
  )

  const existingPerms = await prisma.rolePermission.findMany({
    where: { roleId: { in: allRoles.map((r) => r.id) } },
    select: { id: true, roleId: true, resource: true, action: true, granted: true },
  })
  const existingPermMap = new Map(
    existingPerms.map((p) => [`${p.roleId}::${p.resource}::${p.action}`, p]),
  )

  const permsToCreate: Array<{
    roleId: string
    resource: string
    action: string
    scope: null
    granted: boolean
  }> = []
  const permsToReactivate: string[] = []

  for (const def of SYSTEM_ROLES) {
    const roleId = roleIdByKey.get(`${def.scope}::${def.name}`)
    if (!roleId) continue
    for (const p of def.perms) {
      const key = `${roleId}::${p.resource}::${p.action}`
      const existing = existingPermMap.get(key)
      if (!existing) {
        permsToCreate.push({
          roleId,
          resource: p.resource,
          action: p.action,
          scope: null,
          granted: true,
        })
      } else if (!existing.granted) {
        permsToReactivate.push(existing.id)
      }
    }
  }

  if (permsToCreate.length > 0) {
    await prisma.rolePermission.createMany({
      data: permsToCreate,
      skipDuplicates: true,
    })
  }

  if (permsToReactivate.length > 0) {
    await prisma.rolePermission.updateMany({
      where: { id: { in: permsToReactivate } },
      data: { granted: true },
    })
  }
}