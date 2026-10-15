// backend/src/common/serialize.ts
//
// Utilidades de serialización compartidas.

/**
 * Extrae el nombre del rol de cualquiera de los formatos posibles.
 */
function extractRoleName(r: any): string | null {
  if (r == null) return null
  if (typeof r === 'string') return r
  if (typeof r.roleRef?.name === 'string') return r.roleRef.name
  if (typeof r.name === 'string') return r.name
  if (typeof r.role === 'string') return r.role
  return null
}

/**
 * Normaliza una membership (`TeamMembership`) para que `roles` sea siempre
 * `string[]` de nombres, y `role` el primero.
 */
export function normalizeMembershipRoles<T extends Record<string, any>>(
  m: T,
): T & { roles: string[]; role: string | null } {
  const rawRoles: any[] = Array.isArray(m?.roles) ? m.roles : []

  const roleNames = rawRoles
    .map(extractRoleName)
    .filter((n): n is string => typeof n === 'string')

  const fallbackRole =
    typeof m?.role === 'string' && m.role.length > 0 ? m.role : null
  if (fallbackRole && !roleNames.includes(fallbackRole)) {
    roleNames.unshift(fallbackRole)
  }

  return {
    ...m,
    roles: roleNames,
    role: roleNames[0] ?? null,
  }
}

/**
 * Aplica `normalizeMembershipRoles` a un array.
 */
export function normalizeMembershipRolesList<T extends Record<string, any>>(
  list: T[] | null | undefined,
): (T & { roles: string[]; role: string | null })[] {
  if (!Array.isArray(list)) return []
  return list.map((m) => normalizeMembershipRoles(m))
}

/**
 * Normaliza un `ClubMember` para añadir `role: string | null` como nombre
 * del rol. Conserva `roleRef` intacto por compatibilidad con el frontend
 * actual. Cuando el Lote 3 esté completo, se podrá quitar `roleRef`.
 */
export function normalizeClubMemberRole<T extends Record<string, any>>(
  m: T,
): T & { role: string | null } {
  const roleName = extractRoleName(m?.roleRef) ?? null
  return { ...m, role: roleName }
}

/**
 * Aplica `normalizeClubMemberRole` a un array.
 */
export function normalizeClubMemberRoleList<T extends Record<string, any>>(
  list: T[] | null | undefined,
): (T & { role: string | null })[] {
  if (!Array.isArray(list)) return []
  return list.map((m) => normalizeClubMemberRole(m))
}