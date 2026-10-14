// backend/src/permissions/role-name-maps.ts
// Lote 8.1 — Mapeo de enums legacy → nombres de Role.
// Se usan mientras conviven ambos sistemas (8.1–8.6). En 8.7 se eliminan.

import type { ClubRole, MembershipRoleType } from '@prisma/client'

export type ClubRoleName = 'ADMIN_CLUB' | 'COACH' | 'ASSISTANT' | 'MEMBER'
export type TeamRoleName = 'PLAYER' | 'COACH' | 'ASSISTANT' | 'ADMIN_TEAM'

export function clubRoleNameFromLegacy(role: ClubRole | string): ClubRoleName | null {
  switch (role) {
    case 'ADMIN_CLUB':
    case 'COACH':
    case 'ASSISTANT':
    case 'MEMBER':
      return role
    default:
      return null
  }
}

export function teamRoleNameFromLegacy(
  role: MembershipRoleType | string,
): TeamRoleName | null {
  switch (role) {
    case 'PLAYER':
    case 'COACH':
    case 'ASSISTANT':
    case 'ADMIN_TEAM':
      return role
    case 'VISITOR':
      // VISITOR no existe como Role de sistema. Lo mapeamos a PLAYER.
      return 'PLAYER'
    default:
      return null
  }
}