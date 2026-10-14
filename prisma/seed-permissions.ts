// backend/prisma/seed-permissions.ts
// Lote 8.1 + 8.5 — Fase B
// 1) Crea los roles de sistema por cada club existente.
// 2) Rellena ClubMember.roleId y MembershipRole.roleId mapeando el enum legacy.
// 3) Siembra RolePermission de cada rol de sistema.
// Idempotente: se puede ejecutar varias veces.

import { prisma } from './_client'
import { seedSystemRolesForClub } from '../src/permissions/seed-roles'

// ─────────────────────────────────────────────
// Mapeo enum legacy → nombre de Role
// ─────────────────────────────────────────────

const CLUB_ROLE_MAP: Record<string, string> = {
  ADMIN_CLUB: 'ADMIN_CLUB',
  COACH: 'COACH',
  ASSISTANT: 'ASSISTANT',
  MEMBER: 'MEMBER',
}

const TEAM_ROLE_MAP: Record<string, string> = {
  PLAYER: 'PLAYER',
  COACH: 'COACH',
  ASSISTANT: 'ASSISTANT',
  ADMIN_TEAM: 'ADMIN_TEAM',
  VISITOR: 'PLAYER',
}

async function backfillClubMembers() {
  const members = await prisma.clubMember.findMany({
    where: { roleId: null },
    select: { id: true, clubId: true, role: true },
  })

  for (const m of members) {
    const roleName = CLUB_ROLE_MAP[m.role]
    if (!roleName) {
      console.warn(`ClubMember ${m.id}: rol legacy "${m.role}" sin mapeo. Se omite.`)
      continue
    }

    const role = await prisma.role.findUnique({
      where: { clubId_scope_name: { clubId: m.clubId, scope: 'CLUB', name: roleName } },
      select: { id: true },
    })
    if (!role) {
      console.warn(`ClubMember ${m.id}: no existe Role ${roleName} para club ${m.clubId}`)
      continue
    }

    await prisma.clubMember.update({
      where: { id: m.id },
      data: { roleId: role.id },
    })
  }

  console.log(`ClubMember backfill: ${members.length} procesados.`)
}

async function backfillMembershipRoles() {
  const rows = await prisma.membershipRole.findMany({
    where: { roleId: null },
    select: {
      id: true,
      role: true,
      membership: { select: { team: { select: { clubId: true } } } },
    },
  })

  for (const r of rows) {
    const roleName = TEAM_ROLE_MAP[r.role]
    const clubId = r.membership.team.clubId
    if (!roleName) {
      console.warn(`MembershipRole ${r.id}: rol legacy "${r.role}" sin mapeo. Se omite.`)
      continue
    }

    const role = await prisma.role.findUnique({
      where: { clubId_scope_name: { clubId, scope: 'TEAM', name: roleName } },
      select: { id: true },
    })
    if (!role) {
      console.warn(`MembershipRole ${r.id}: no existe Role ${roleName} para club ${clubId}`)
      continue
    }

    await prisma.membershipRole.update({
      where: { id: r.id },
      data: { roleId: role.id },
    })
  }

  console.log(`MembershipRole backfill: ${rows.length} procesados.`)
}

async function main() {
  const clubs = await prisma.club.findMany({ select: { id: true, name: true } })
  console.log(`Clubs encontrados: ${clubs.length}`)

  for (const c of clubs) {
    await seedSystemRolesForClub(prisma as any, c.id)
    console.log(`  Roles de sistema asegurados en club ${c.name} (${c.id})`)
  }

  // Fase C ya hizo `roleId` NOT NULL, así que el backfill ya no aplica.
  // Se mantiene el código comentado por si en el futuro alguien vuelve
  // a tener columnas nullable por una migración reversible.

  console.log('Seed Fase B completo.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })