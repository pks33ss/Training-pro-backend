// backend/src/common/serialize.ts
//
// Utilidades de serialización compartidas.
//
// Objetivo: unificar la forma en la que se devuelven los roles de una
// membership (`TeamMembership`) al frontend. Antes cada endpoint devolvía
// un formato distinto:
//
//   - `["PLAYER"]`                                  (strings)
//   - `[{ roleRef: { name: "PLAYER" } }]`           (objetos con roleRef)
//   - `[{ name: "PLAYER" }]`                        (objetos con name)
//   - `"PLAYER"` (a nivel de `role`)
//
// Ahora todos devolverán `string[]` de nombres de rol. Y además
// `role` seguirá existiendo como el primer rol, por compatibilidad con
// pantallas que aún lean `m.role`.

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
 * Normaliza una membership (o cualquier objeto con `roles`) para que
 * `roles` sea siempre `string[]` de nombres, y `role` el primero.
 *
 * Acepta objetos con `roles` en cualquier formato y con `role` opcional.
 */
export function normalizeMembershipRoles<T extends Record<string, any>>(
  m: T,
): T & { roles: string[]; role: string | null } {
  const rawRoles: any[] = Array.isArray(m?.roles) ? m.roles : []

  const roleNames = rawRoles
    .map(extractRoleName)
    .filter((n): n is string => typeof n === 'string')

  // Si venía `m.role` como string y no está en la lista, lo añadimos al
  // principio para no perder información.
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