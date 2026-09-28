// backend/scripts/check-column.ts
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  // 1) ¿Existe la columna role en TeamMembership?
  const col = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'TeamMembership' AND column_name = 'role'
  `
  console.log('Columna TeamMembership.role existe:', col.length > 0)

  // 2) ¿Cuántas filas hay en MembershipRole?
  const mrCount = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "MembershipRole"
  `
  console.log('Filas en MembershipRole:', Number(mrCount[0].count))

  // 3) Si existe role, ver distribución
  if (col.length > 0) {
    const dist = await prisma.$queryRaw<{ role: string; count: bigint }[]>`
      SELECT role, COUNT(*)::bigint AS count
      FROM "TeamMembership"
      GROUP BY role
    `
    console.log('Distribución TeamMembership.role:')
    dist.forEach((r) => console.log(`  ${r.role}: ${Number(r.count)}`))
  }

  // 4) ¿Existe el índice único nuevo (userId, teamId)?
  const idx = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'TeamMembership'
      AND indexdef LIKE '%UNIQUE%'
  `
  console.log('Índices únicos en TeamMembership:')
  idx.forEach((i) => console.log(`  ${i.indexname}`))

  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })