// backend/src/permissions/require-permission.decorator.ts
// Lote 8.4 — Decorador @RequirePermission.

import { SetMetadata } from '@nestjs/common'
import type {
  PermissionAction,
  PermissionResource,
} from './permissions.constants'

export const PERMISSION_META_KEY = 'permissions:require'

export type IdSource =
  | string
  | { param: string }
  | { body: string }
  | { query: string }

export interface PermissionMeta {
  resource: PermissionResource
  action: PermissionAction
  /** De dónde sacar el clubId. Default: `{ param: 'clubId' }`. */
  clubIdFrom?: IdSource
  /** De dónde sacar el teamId (opcional). */
  teamIdFrom?: IdSource
}

export interface RequirePermissionOptions {
  clubIdFrom?: IdSource
  teamIdFrom?: IdSource
}

/**
 * Anota un endpoint con el permiso requerido.
 *
 * Ejemplos:
 *   @RequirePermission('team', 'edit', { teamIdFrom: { param: 'id' }, clubIdFrom: { body: 'clubId' } })
 *   @RequirePermission('member', 'view', { clubIdFrom: { param: 'clubId' } })
 */
export const RequirePermission = (
  resource: PermissionResource,
  action: PermissionAction,
  opts: RequirePermissionOptions = {},
) =>
  SetMetadata(PERMISSION_META_KEY, {
    resource,
    action,
    clubIdFrom: opts.clubIdFrom ?? { param: 'clubId' },
    teamIdFrom: opts.teamIdFrom,
  } as PermissionMeta)