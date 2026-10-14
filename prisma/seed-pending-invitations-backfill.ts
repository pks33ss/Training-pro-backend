// backend/prisma/seed-pending-invitations-backfill.ts
// Lote 8.7 C.3 — Backfill de PendingInvitation.roleId.
//
// Mapea el `role` legacy (enum MembershipRoleType) al nombre del rol de
// sistema TEAM correspondiente y guarda su `id` en `roleId`.
//
// Idempotente: solo procesa las filas con `roleId` null.

import { prisma } from './_client'

// Mapeo enum legacy → nombre del Role de sistema
const LEGACY_TO_ROLE_NAME: Record<string, string> = {
  PLAYER: 'PLAYER',
  COACH: 'COACH',
  ASSISTANT: 'ASSISTANT',
  ADMIN_TEAM: 'ADMIN_TEAM',
  VISITOR: 'PLAYER',
}

async function main() {
  console.log('🚀 Backfill PendingInvitation.roleId')

  const pending = await prisma.pendingInvitation.findMany({
    where: { roleId: null },
    select: { id: true, role: true, teamId: true },
  })

  console.log(`Pendientes de backfill: ${pending.length}`)

  let ok = 0
  let skip = 0

  for (const p of pending) {
    const roleName = LEGACY_TO_ROLE_NAME[p.role]
    if (!roleName) {
      console.warn(`  ⚠️  Invitación ${p.id}: rol legacy "${p.role}" sin mapeo.`)
      skip++
      continue
    }

    const team = await prisma.team.findUnique({
      where: { id: p.teamId },
      select: { clubId: true },
    })
    if (!team) {
      console.warn(`  ⚠️  Invitación ${p.id}: team ${p.teamId} no encontrado.`)
      skip++
      continue
    }

    const role = await prisma.role.findUnique({
      where: {
        clubId_scope_name: {
          clubId: team.clubId,
          scope: 'TEAM',
          name: roleName,
        },
      },
      select: { id: true },
    })
    if (!role) {
      console.warn(
        `  ⚠️  Invitación ${p.id}: no existe Role ${roleName} para club ${team.clubId}.`,
      )
      skip++
      continue
    }

    await prisma.pendingInvitation.update({
      where: { id: p.id },
      data: { roleId: role.id },
    })
    ok++
  }

  console.log(`  ✅ ${ok} filas actualizadas`)
  if (skip > 0) console.log(`  ⚠️  ${skip} filas saltadas`)
  console.log('Backfill completo.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })