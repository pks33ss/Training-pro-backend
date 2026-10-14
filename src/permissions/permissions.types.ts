// backend/src/permissions/permissions.types.ts
import {
  DEFAULT_VIEWABLE_RESOURCES,
  type PermissionAction,
  type PermissionResource,
} from './permissions.constants'

export interface RolePermissionEntry {
  resource: PermissionResource
  action: PermissionAction
  scope: string | null
  granted: boolean
}

export interface EffectivePermissions {
  /** Set "resource:action" para chequeo club-wide. */
  clubWide: Set<string>
  /** teamId -> Set "resource:action" permitidos en ese equipo. */
  perTeam: Map<string, Set<string>>
}

export const keyOf = (r: PermissionResource, a: PermissionAction) => `${r}:${a}`

export const parseKey = (k: string) => {
  const [resource, action] = k.split(':') as [PermissionResource, PermissionAction]
  return { resource, action }
}

export function emptyPermissions(): EffectivePermissions {
  return { clubWide: new Set(), perTeam: new Map() }
}

export function defaultPermissionsForNoRole(): EffectivePermissions {
  const clubWide = new Set<string>()
  for (const r of DEFAULT_VIEWABLE_RESOURCES) clubWide.add(keyOf(r, 'view'))
  return { clubWide, perTeam: new Map() }
}

export function can(
  perms: EffectivePermissions,
  resource: PermissionResource,
  action: PermissionAction,
  teamId?: string | null,
): boolean {
  const k = keyOf(resource, action)
  if (teamId) {
    const t = perms.perTeam.get(teamId)
    if (t?.has(k)) return true
  }
  return perms.clubWide.has(k)
}