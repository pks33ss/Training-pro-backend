// backend/src/permissions/permissions.types.ts
// Lote 4.C — Tipos auxiliares.
// Se eliminan `EffectivePermissions`, `emptyPermissions`, `defaultPermissionsForNoRole`
// y `can` (la lógica vive ahora en PermissionsService).
// Se mantienen `keyOf` y `parseKey` (útiles para serializar).

import type {
  PermissionAction,
  PermissionResource,
} from './permissions.constants'

export interface RolePermissionEntry {
  resource: PermissionResource
  action: PermissionAction
  scope: string | null
  granted: boolean
}

export const keyOf = (r: PermissionResource, a: PermissionAction) =>
  `${r}:${a}`

export const parseKey = (k: string) => {
  const [resource, action] = k.split(':') as [
    PermissionResource,
    PermissionAction,
  ]
  return { resource, action }
}