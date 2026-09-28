// backend/scripts/check-roles.ts
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('=== TeamMembership.role (fuente de verdad hoy) ===')
  const tmRoles = await prisma.teamMembership.groupBy({
    by: ['role'],
    _count: { _all: true },
  })
  tmRoles.forEach((r) => console.log(`  ${r.role}: ${r._count._all}`))

  console.log('\n=== TeamMember.role (legacy) ===')
  const teamMemberRoles = await prisma.teamMember.groupBy({
    by: ['role'],
    _count: { _all: true },
  })
  teamMemberRoles.forEach((r) => console.log(`  ${r.role}: ${r._count._all}`))

  console.log('\n=== PendingInvitation.role ===')
  const invRoles = await prisma.pendingInvitation.groupBy({
    by: ['role'],
    _count: { _all: true },
  })
  invRoles.forEach((r) => console.log(`  ${r.role}: ${r._count._all}`))

  console.log('\n=== Duplicados (userId, teamId) en TeamMembership ===')
  const all = await prisma.teamMembership.findMany({
    select: { id: true, userId: true, teamId: true, seasonId: true, status: true, role: true },
  })
  const byPair = new Map<string, typeof all>()
  for (const m of all) {
    const key = `${m.userId}::${m.teamId}`
    if (!byPair.has(key)) byPair.set(key, [])
    byPair.get(key)!.push(m)
  }
  const dups = Array.from(byPair.entries()).filter(([, arr]) => arr.length > 1)
  console.log(`  Total memberships: ${all.length}`)
  console.log(`  Pares (userId, teamId) con >1 fila: ${dups.length}`)
  if (dups.length > 0) {
    for (const [key, arr] of dups) {
      console.log(`    ⚠️  ${key} → ${arr.length} filas`)
      arr.forEach((m) => console.log(`        id=${m.id} seasonId=${m.seasonId} status=${m.status} role=${m.role}`))
    }
  }

  console.log('\n=== Roles desconocidos (fuera de PLAYER|COACH|ASSISTANT|ADMIN_TEAM) ===')
  const known = new Set(['PLAYER', 'COACH', 'ASSISTANT', 'ADMIN_TEAM'])
  const unknown = tmRoles.filter((r) => !known.has(r.role))
  if (unknown.length === 0) console.log('  Ninguno ✅')
  else unknown.forEach((r) => console.log(`  ⚠️  ${r.role}: ${r._count._all}`))

  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})