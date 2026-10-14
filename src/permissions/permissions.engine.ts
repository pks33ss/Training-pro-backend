// backend/src/permissions/permissions.engine.ts
// Lote 8.2 — Selección del motor de permisos.
// Durante 8.2–8.6 conviven dos motores:
//   - 'access': lógica legacy (pre-matriz). Comportamiento actual.
//   - 'matrix': PermissionsService (nuevo).
// En 8.7 se retira el flag y el legacy.

export type PermissionsEngineKind = 'access' | 'matrix'

export function getEngine(): PermissionsEngineKind {
  const raw = (process.env.PERMISSIONS_ENGINE ?? 'access').toLowerCase()
  if (raw === 'matrix') return 'matrix'
  return 'access'
}