// backend/src/permissions/permissions.constants.ts
// Lote 8.5 — Constantes de la matriz de permisos.
// Se han añadido: session, match, attendance, season, library.
// Se mantiene `event` como legacy (para el calendario).

export const PERMISSION_RESOURCES = [
  'team',
  'member',
  'invitation',
  'membership_role',
  'payment',
  'session',    // ✅ NUEVO
  'match',      // ✅ NUEVO
  'attendance', // ✅ NUEVO
  'season',     // ✅ NUEVO
  'event',      // legacy (calendario)
  'document',   // Playbook
  'library',    // ✅ NUEVO (Biblioteca)
  'club_settings',
  'club_branding',
  'report',
  'role_admin',
  'player_profile',
  'stats_config',
  'user_private_data',
  'ghost_edit',
] as const;

export type PermissionResource = (typeof PERMISSION_RESOURCES)[number];

export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const RESOURCE_LABELS_ES: Record<PermissionResource, string> = {
  team: 'Equipos',
  member: 'Miembros',
  invitation: 'Invitaciones',
  membership_role: 'Roles de equipo',
  payment: 'Pagos',
  session: 'Sesiones de entrenamiento',
  match: 'Partidos',
  attendance: 'Asistencia',       // ✅ NUEVO
  season: 'Planificación',        // ✅ NUEVO
  event: 'Calendario',            // ✅ Cambiado (antes Eventos)
  document: 'Playbook',           // ✅ Cambiado (antes Documentos)
  library: 'Biblioteca',          // ✅ NUEVO
  club_settings: 'Configuración del club',
  club_branding: 'Branding',
  report: 'Reportes',
  role_admin: 'Gestión de roles',
  player_profile: 'Perfiles de jugador',
  stats_config: 'Configuración de estadísticas',
  user_private_data: 'Datos privados de usuarios',
  ghost_edit: 'Edición de ghosts',
};

export const ACTION_LABELS_ES: Record<PermissionAction, string> = {
  view: 'Ver',
  create: 'Crear',
  edit: 'Editar',
  delete: 'Eliminar',
};

/** Acciones válidas por recurso. Si un recurso no aparece, se asumen las 4. */
export const ACTIONS_BY_RESOURCE: Partial<
  Record<PermissionResource, readonly PermissionAction[]>
> = {
  invitation: ['view', 'create', 'delete'],
  membership_role: ['view', 'create', 'delete'],
  club_settings: ['view', 'edit'],
  club_branding: ['view', 'edit'],
  report: ['view'],
  player_profile: ['view', 'edit'],
  stats_config: ['view', 'edit'],
  user_private_data: ['view'],
  ghost_edit: ['edit'],
};

export function actionsFor(resource: PermissionResource): readonly PermissionAction[] {
  return ACTIONS_BY_RESOURCE[resource] ?? PERMISSION_ACTIONS;
}

/**
 * Recursos que un usuario SIN ClubMember ve por defecto.
 * `event`, `session`, `match`, `attendance`, `season` dependen de la matriz.
 */
export const DEFAULT_VIEWABLE_RESOURCES: readonly PermissionResource[] = [
  'team',
  'member',
  'document',
  'library', // ✅ Añadido
  'club_settings',
  'club_branding',
];

export const ROLE_SCOPE_CLUB = 'CLUB' as const;
export const ROLE_SCOPE_TEAM = 'TEAM' as const;
export type RoleScope = typeof ROLE_SCOPE_CLUB | typeof ROLE_SCOPE_TEAM;

export const SYSTEM_CLUB_ROLES = ['ADMIN_CLUB', 'COACH', 'ASSISTANT', 'MEMBER'] as const;
export type SystemClubRole = (typeof SYSTEM_CLUB_ROLES)[number];

export const SYSTEM_TEAM_ROLES = ['PLAYER', 'COACH', 'ASSISTANT', 'ADMIN_TEAM'] as const;
export type SystemTeamRole = (typeof SYSTEM_TEAM_ROLES)[number];

export const SCOPE_CLUB = null;
export const scopeTeam = (teamId: string) => `team:${teamId}`;