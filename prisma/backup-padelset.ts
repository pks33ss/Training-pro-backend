import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  const tableName = 'PadelSet_backup_20261004'

  // 1) Borrar tabla si ya existe (idempotente)
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${tableName}"`)

  // 2) Crear tabla backup como copia
  await prisma.$executeRawUnsafe(
    `CREATE TABLE "${tableName}" AS SELECT * FROM "PadelSet"`,
  )

  // 3) Verificar
  const rows: any = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int as count FROM "${tableName}"`,
  )
  console.log(`✅ Backup creado: ${tableName} con ${rows[0]?.count} filas`)
}

main()
  .catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })