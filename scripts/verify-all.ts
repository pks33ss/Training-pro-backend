// backend/scripts/verify-all.ts
// Verificación completa del estado tras la recuperación + backfill
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('═══════════════════════════════════════════')
  console.log('  VERIFICACIÓN ESTADO ROLES REFACTOR')
  console.log('═══════════════════════════════════════════\n')

  // 1) ¿Existe TeamMembership.role?
  const col = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'TeamMembership' AND column_name = 'role'
  `
  const hasRole = col.length > 0
  console.log(`1) TeamMembership.role existe:      ${hasRole ? '✅' : '❌'}`)

  // 2) Contar memberships
  const tmCount = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "TeamMembership"
  `
  const total = Number(tmCount[0].count)
  console.log(`   Total TeamMembership:             ${total} (esperado 49)`)

  // 3) Distribución de role si existe
  if (hasRole) {
    const dist = await prisma.$queryRaw<{ role: string | null; count: bigint }[]>`
      SELECT role, COUNT(*)::bigint AS count
      FROM "TeamMembership"
      GROUP BY role
      ORDER BY role
    `
    console.log(`\n2) Distribución TeamMembership.role:`)
    dist.forEach((r) =>
      console.log(`     ${r.role ?? 'NULL'}: ${Number(r.count)}`),
    )
  }

  // 4) Contar MembershipRole
  const mrCount = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "MembershipRole"
  `
  const mrTotal = Number(mrCount[0].count)
  console.log(`\n3) Total MembershipRole:            ${mrTotal} (esperado 49)`)

  const mrDist = await prisma.$queryRaw<{ role: string; count: bigint }[]>`
    SELECT role, COUNT(*)::bigint AS count
    FROM "MembershipRole"
    GROUP BY role
    ORDER BY role
  `
  console.log(`   Distribución MembershipRole:`)
  mrDist.forEach((r) => console.log(`     ${r.role}: ${Number(r.count)}`))

  // 5) Memberships sin rol
  const sinRol = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "TeamMembership" tm
    LEFT JOIN "MembershipRole" mr ON mr."membershipId" = tm.id
    WHERE mr.id IS NULL
  `
  const sinRolN = Number(sinRol[0].count)
  console.log(`\n4) Memberships SIN rol:             ${sinRolN} ${sinRolN === 0 ? '✅' : '⚠️'}`)

  // 6) Comparar role actual vs MembershipRole (si la columna existe)
  if (hasRole) {
    const mismatch = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "TeamMembership" tm
      WHERE NOT EXISTS (
        SELECT 1 FROM "MembershipRole" mr
        WHERE mr."membershipId" = tm.id AND mr.role::text = tm.role
      )
    `
    const mismatchN = Number(mismatch[0].count)
    console.log(`5) Memberships con role != MembershipRole: ${mismatchN} ${mismatchN === 0 ? '✅' : '⚠️'}`)
  }

  // 7) Índice único actual
  const idx = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'TeamMembership' AND indexdef LIKE '%UNIQUE%'
    ORDER BY indexname
  `
  console.log(`\n6) Índices únicos en TeamMembership:`)
  idx.forEach((i) => console.log(`     ${i.indexname}`))

  console.log('\n═══════════════════════════════════════════')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})