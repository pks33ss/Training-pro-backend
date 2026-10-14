// backend/scripts/backfill-membership-roles.ts
// v2 — SQL raw + id generado en JS (evita depender de pgcrypto)
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { randomUUID } from 'crypto'
import 'dotenv/config'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  // 1) ¿Existe la columna?
  const col = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'TeamMembership' AND column_name = 'role'
  `
  if (col.length === 0) {
    console.error('❌ La columna TeamMembership.role no existe. Restaura primero.')
    process.exit(2)
  }

  // 2) Leer memberships con su role
  const rows = await prisma.$queryRaw<{ id: string; role: string }[]>`
    SELECT id, role FROM "TeamMembership"
  `
  console.log(`Memberships a procesar: ${rows.length}`)

  const VALID = new Set(['PLAYER', 'COACH', 'ASSISTANT', 'ADMIN_TEAM'])
  let created = 0, skipped = 0, invalid = 0

  for (const m of rows) {
    if (!VALID.has(m.role)) {
      console.warn(`  ⚠️  membership ${m.id} tiene role inválido: "${m.role}" — se omite`)
      invalid++
      continue
    }

    const id = randomUUID()
    const result = await prisma.$executeRaw`
      INSERT INTO "MembershipRole" (id, "membershipId", role, "createdAt")
      VALUES (${id}, ${m.id}, ${m.role}::"MembershipRoleType", now())
      ON CONFLICT ("membershipId", role) DO NOTHING
    `
    if (result > 0) created++
    else skipped++
  }

  console.log(`\nResultado:`)
  console.log(`  Creados:   ${created}`)
  console.log(`  Ya exist.: ${skipped}`)
  console.log(`  Inválidos: ${invalid}`)

  process.exit(invalid > 0 ? 2 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })