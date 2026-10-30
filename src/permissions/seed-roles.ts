// backend/src/permissions/seed-roles.ts
// Lote 8.1 + 8.5 — Siembra de roles de sistema para un club.
// Usado por club.service.create() para que un club nuevo tenga sus roles.
// Refleja exactamente lo que hace prisma/seed-permissions.ts.
//
// v2 — Optimizado para usar createMany en bloque (antes hacía ~200
// queries individuales que tardaban >5s en Neon y rompían la transacción
// del ClubService.create por timeout).

import type { Prisma } from '@prisma/client'

type PrismaLike = Prisma.TransactionClient

type Resource =
  | 'team' | 'member' | 'invitation' | 'membership_role' | 'payment'
  | 'event' | 'document' | 'club_settings' | 'club_branding' | 'report'
  | 'role_admin' | 'player_profile' | 'stats_config'
  | 'user_private_data' | 'ghost_edit'

type Action = 'view' | 'create' | 'edit' | 'delete'
interface Perm { resource: Resource; action: Action }

const P = (resource: Resource, ...actions: Action[]): Perm[] =>
  actions.map((action) => ({ resource, action }))

// ─────────────────────────────────────────────
// CLUB — roles existentes
// ─────────────────────────────────────────────

const ADMIN_CLUB_PERMS: Perm[] = [] // bypass en código

const COACH_CLUB: Perm[] = [
  ...P('team', 'view', 'create', 'edit'),
  ...P('member', 'view', 'create', 'edit', 'delete'),
  ...P('invitation', 'view', 'create', 'delete'),
  ...P('membership_role', 'view', 'create', 'delete'),
  ...P('payment', 'view', 'create', 'edit'),
  ...P('event', 'view', 'create', 'edit', 'delete'),
  ...P('document', 'view', 'create', 'edit', 'delete'),
  ...P('club_settings', 'view'),
  ...P('club_branding', 'view'),
  ...P('report', 'view'),
  ...P('player_profile', 'view', 'edit'),
  ...P('stats_config', 'view', 'edit'),
  ...P('user_private_data', 'view'),
  ...P('ghost_edit', 'edit'),
]

const ASSISTANT_CLUB: Perm[] = [
  ...P('team', 'view'),
  ...P('member', 'view', 'create', 'edit'),
  ...P('invitation', 'view', 'create'),
  ...P('membership_role', 'view', 'create'),
  ...P('payment', 'view'),
  ...P('event', 'view', 'create', 'edit'),
  ...P('document', 'view', 'create'),
  ...P('club_settings', 'view'),
  ...P('club_branding', 'view'),
  ...P('report', 'view'),
  ...P('player_profile', 'view'),
  ...P('stats_config', 'view'),
]

const MEMBER_CLUB: Perm[] = [
  ...P('team', 'view'),
  ...P('member', 'view'),
  ...P('event', 'view'),
  ...P('document', 'view'),
  ...P('club_settings', 'view'),
  ...P('club_branding', 'view'),
]

// ─────────────────────────────────────────────
// CLUB — roles NUEVOS (Lote 8.5)
// ─────────────────────────────────────────────

const TESORERO_CLUB: Perm[] = [
  ...P('payment', 'view', 'create', 'edit', 'delete'),
  ...P('member', 'view'),
  ...P('report', 'view'),
  ...P('user_private_data', 'view'),
]

const SECRETARIO_CLUB: Perm[] = [
  ...P('member', 'view', 'create', 'edit'),
  ...P('document', 'view', 'create', 'edit', 'delete'),
  ...P('club_settings', 'view'),
  ...P('report', 'view'),
  ...P('user_private_data', 'view'),
  ...P('ghost_edit', 'edit'),
]

const COORDINADOR_CLUB: Perm[] = [
  ...P('team', 'view', 'create', 'edit'),
  ...P('member', 'view', 'create', 'edit', 'delete'),
  ...P('invitation', 'view', 'create', 'delete'),
  ...P('membership_role', 'view', 'create', 'delete'),
  ...P('event', 'view', 'create', 'edit', 'delete'),
  ...P('document', 'view', 'create', 'edit', 'delete'),
  ...P('report', 'view'),
  ...P('player_profile', 'view', 'edit'),
  ...P('stats_config', 'view', 'edit'),
  ...P('user_private_data', 'view'),
  ...P('ghost_edit', 'edit'),
]

const DIRECTOR_DEPORTIVO_CLUB: Perm[] = [
  ...P('team', 'view', 'create', 'edit'),
  ...P('member', 'view', 'create', 'edit', 'delete'),
  ...P('invitation', 'view', 'create', 'delete'),
  ...P('membership_role', 'view', 'create', 'delete'),
  ...P('event', 'view', 'create', 'edit', 'delete'),
  ...P('document', 'view', 'create', 'edit', 'delete'),
  ...P('report', 'view'),
  ...P('player_profile', 'view', 'edit'),
  ...P('stats_config', 'view', 'edit'),
  ...P('user_private_data', 'view'),
  ...P('ghost_edit', 'edit'),
  ...P('payment', 'view'),
  ...P('role_admin', 'view'),
]

const OJEADOR_CLUB: Perm[] = [
  ...P('team', 'view'),
  ...P('member', 'view'),
  ...P('event', 'view'),
  ...P('document', 'view'),
  ...P('report', 'view'),
  ...P('player_profile', 'view'),
  ...P('stats_config', 'view'),
]

// ─────────────────────────────────────────────
// TEAM — roles existentes
// ─────────────────────────────────────────────

const PLAYER_TEAM: Perm[] = [
  ...P('team', 'view'),
  ...P('event', 'view'),
  ...P('player_profile', 'view'),
]

const COACH_TEAM: Perm[] = [
  ...P('team', 'view', 'edit'),
  ...P('member', 'view', 'create', 'edit', 'delete'),
  ...P('invitation', 'view', 'create', 'delete'),
  ...P('membership_role', 'view', 'create', 'delete'),
  ...P('event', 'view', 'create', 'edit', 'delete'),
  ...P('document', 'view', 'create', 'edit', 'delete'),
  ...P('player_profile', 'view', 'edit'),
  ...P('stats_config', 'view', 'edit'),
  ...P('user_private_data', 'view'),
  ...P('ghost_edit', 'edit'),
]

const ASSISTANT_TEAM: Perm[] = [
  ...P('team', 'view'),
  ...P('member', 'view', 'create', 'edit'),
  ...P('invitation', 'view', 'create'),
  ...P('membership_role', 'view', 'create'),
  ...P('event', 'view', 'create', 'edit'),
  ...P('document', 'view', 'create'),
  ...P('player_profile', 'view'),
  ...P('stats_config', 'view'),
]

const ADMIN_TEAM: Perm[] = [
  ...P('team', 'view', 'edit'),
  ...P('member', 'view', 'create', 'edit', 'delete'),
  ...P('invitation', 'view', 'create', 'delete'),
  ...P('membership_role', 'view', 'create', 'delete'),
  ...P('event', 'view', 'create', 'edit', 'delete'),
  ...P('document', 'view', 'create', 'edit', 'delete'),
  ...P('player_profile', 'view', 'edit'),
  ...P('stats_config', 'view', 'edit'),
  ...P('user_private_data', 'view'),
  ...P('ghost_edit', 'edit'),
]

// ─────────────────────────────────────────────
// TEAM — roles NUEVOS (Lote 8.5)
// ─────────────────────────────────────────────

const DELEGADO_TEAM: Perm[] = [
  ...P('team', 'view'),
  ...P('member', 'view'),
  ...P('invitation', 'view'),
  ...P('event', 'view'),
  ...P('document', 'view'),
  ...P('player_profile', 'view'),
]

const FISIO_TEAM: Perm[] = [
  ...P('team', 'view'),
  ...P('member', 'view'),
  ...P('player_profile', 'view', 'edit'),
  ...P('stats_config', 'view'),
  ...P('user_private_data', 'view'),
]

const ENTRENADOR_VISITANTE_TEAM: Perm[] = [
  ...P('team', 'view'),
  ...P('member', 'view'),
  ...P('membership_role', 'view'),
  ...P('event', 'view'),
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
  // CLUB
  { scope: 'CLUB', name: 'ADMIN_CLUB', description: 'Administrador del club (bypass total)', isDefault: false, perms: ADMIN_CLUB_PERMS },
  { scope: 'CLUB', name: 'COACH', description: 'Entrenador del club', isDefault: false, perms: COACH_CLUB },
  { scope: 'CLUB', name: 'ASSISTANT', description: 'Ayudante del club', isDefault: false, perms: ASSISTANT_CLUB },
  { scope: 'CLUB', name: 'MEMBER', description: 'Miembro del club', isDefault: true, perms: MEMBER_CLUB },
  { scope: 'CLUB', name: 'TESORERO', description: 'Gestiona pagos y cuotas del club', isDefault: false, perms: TESORERO_CLUB },
  { scope: 'CLUB', name: 'SECRETARIO', description: 'Documentación y altas/bajas', isDefault: false, perms: SECRETARIO_CLUB },
  { scope: 'CLUB', name: 'COORDINADOR', description: 'Coordina todas las categorías del club', isDefault: false, perms: COORDINADOR_CLUB },
  { scope: 'CLUB', name: 'DIRECTOR_DEPORTIVO', description: 'Dirección deportiva del club', isDefault: false, perms: DIRECTOR_DEPORTIVO_CLUB },
  { scope: 'CLUB', name: 'OJEADOR', description: 'Solo lectura de perfiles y estadísticas', isDefault: false, perms: OJEADOR_CLUB },

  // TEAM
  { scope: 'TEAM', name: 'PLAYER', description: 'Jugador', isDefault: true, perms: PLAYER_TEAM },
  { scope: 'TEAM', name: 'COACH', description: 'Entrenador de equipo', isDefault: false, perms: COACH_TEAM },
  { scope: 'TEAM', name: 'ASSISTANT', description: 'Ayudante de equipo', isDefault: false, perms: ASSISTANT_TEAM },
  { scope: 'TEAM', name: 'ADMIN_TEAM', description: 'Administrador de equipo', isDefault: false, perms: ADMIN_TEAM },
  { scope: 'TEAM', name: 'DELEGADO', description: 'Logística del equipo', isDefault: false, perms: DELEGADO_TEAM },
  { scope: 'TEAM', name: 'FISIO', description: 'Fisioterapeuta del equipo', isDefault: false, perms: FISIO_TEAM },
  { scope: 'TEAM', name: 'ENTRENADOR_VISITANTE', description: 'Ve el equipo sin poder editar', isDefault: false, perms: ENTRENADOR_VISITANTE_TEAM },
]

/**
 * Siembra los roles del sistema para un club.
 *
 * Optimizado en v2:
 *  - Antes hacía `upsert(role)` + `findFirst(perm)` + `create/update(perm)`
 *    para cada permiso. Con 15 roles × ~15 permisos son ~450 queries.
 *  - Ahora hace 3 queries en bloque: findMany(roles), createMany(roles),
 *    findMany(perms) + createMany(perms) + updateMany(perms).
 *  - Reduce el tiempo de ~6s a ~300ms en Neon.
 *
 * Nota: como el club es NUEVO, no existen roles previos. No hace falta
 * upsert ni comprobar duplicados; creamos todos de golpe. Solo usamos
 * findMany al principio para cubrir el caso de que se llame dos veces
 * sobre el mismo club (idempotencia básica).
 */
export async function seedSystemRolesForClub(
  prisma: PrismaLike,
  clubId: string,
): Promise<void> {
  // 1) Roles ya existentes en el club (para idempotencia)
  const existingRoles = await prisma.role.findMany({
    where: { clubId },
    select: { id: true, scope: true, name: true },
  })
  const existingMap = new Map(
    existingRoles.map((r) => [`${r.scope}::${r.name}`, r.id]),
  )

  // 2) Roles que faltan crear
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

  // 3) Recuperar TODOS los roles del club (los ya existentes + los nuevos)
  const allRoles = await prisma.role.findMany({
    where: { clubId },
    select: { id: true, scope: true, name: true },
  })
  const roleIdByKey = new Map(
    allRoles.map((r) => [`${r.scope}::${r.name}`, r.id]),
  )

  // 4) Permisos ya existentes (para idempotencia)
  const existingPerms = await prisma.rolePermission.findMany({
    where: { roleId: { in: allRoles.map((r) => r.id) } },
    select: { id: true, roleId: true, resource: true, action: true, granted: true },
  })

  const existingPermMap = new Map(
    existingPerms.map((p) => [
      `${p.roleId}::${p.resource}::${p.action}`,
      p,
    ]),
  )

  // 5) Calcular qué permisos faltan y cuáles hay que reactivar
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
    if (!roleId) continue // no debería pasar

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

  // 6) Insertar permisos nuevos de golpe
  if (permsToCreate.length > 0) {
    await prisma.rolePermission.createMany({
      data: permsToCreate,
      skipDuplicates: true,
    })
  }

  // 7) Reactivar permisos que estaban desactivados
  if (permsToReactivate.length > 0) {
    await prisma.rolePermission.updateMany({
      where: { id: { in: permsToReactivate } },
      data: { granted: true },
    })
  }
}