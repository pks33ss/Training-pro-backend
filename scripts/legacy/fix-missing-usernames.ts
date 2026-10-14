import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
})
const prisma = new PrismaClient({ adapter })

/**
 * Genera un username único a partir del nombre y apellido.
 * Copia local (el script no importa desde src/ para no acoplarse).
 */
async function generateUniqueUsername(
  name: string,
  lastName: string,
  excludeUserId?: string,
): Promise<string> {
  const base = ((name?.[0] ?? '') + (lastName ?? ''))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[^a-z0-9]/g, '')

  if (!base) return `@user${Date.now()}`

  let username = `@${base}`
  let counter = 1

  while (true) {
    const existing = await prisma.user.findUnique({ where: { username } })
    if (!existing || existing.id === excludeUserId) return username
    counter++
    username = `@${base}${counter}`
  }
}

async function main() {
  console.log('🔍 Buscando Users sin username...\n')

  const users = await prisma.user.findMany({
    where: { username: null },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`   Encontrados ${users.length} users sin username\n`)

  if (users.length === 0) {
    console.log('✅ Nada que hacer. Todos los Users tienen username.')
    process.exit(0)
  }

  let fixed = 0

  for (const user of users) {
    const username = await generateUniqueUsername(user.name, user.lastName, user.id)

    await prisma.user.update({
      where: { id: user.id },
      data: { username },
    })

    console.log(`   ✅ ${user.name} ${user.lastName} (${user.email ?? 'sin email'}) → ${username}`)
    fixed++
  }

  console.log(`\n🎉 ${fixed} usernames generados\n`)
  process.exit(0)
}

main().catch((e) => {
  console.error('❌ Error:', e)
  process.exit(1)
})