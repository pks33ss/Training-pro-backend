import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  const user = await prisma.user.findUnique({
    where: { id: 'cmui8jqnq000780v4we6welx0' },
  })

  if (!user) {
    console.log('❌ User no encontrado por ID')
    process.exit(0)
  }

  console.log('=== ANÁLISIS DEL USERNAME ===')
  console.log('username raw:', JSON.stringify(user.username))
  console.log('length:', user.username?.length)

  if (user.username) {
    console.log('char codes:')
    user.username.split('').forEach((c, i) => {
      const code = c.charCodeAt(0).toString(16).padStart(4, '0')
      console.log(`  [${i}] "${c}" = U+${code} (dec ${c.charCodeAt(0)})`)
    })
  }

  console.log('')
  console.log('=== BÚSQUEDA POR USERNAME ===')

  const found1 = await prisma.user.findUnique({
    where: { username: user.username! },
  })
  console.log('findUnique con username raw:', found1 ? '✅ encontrado' : '❌ NO')

  const cleaned = user.username!.trim()
  console.log('username limpio:', JSON.stringify(cleaned))
  const found2 = await prisma.user.findUnique({
    where: { username: cleaned },
  })
  console.log('findUnique con trimmed:', found2 ? '✅ encontrado' : '❌ NO')

  process.exit(0)
}

main()