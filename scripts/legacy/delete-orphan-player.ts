import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  const playerId = 'cmuhgrl11000a4ov4lbtt11g1'

  const player = await prisma.player.findUnique({
    where: { id: playerId },
  })

  if (!player) {
    console.log('Ya no existe, nada que borrar.')
    process.exit(0)
  }

  console.log('Borrando Player:', player.name, player.lastName)

  await prisma.player.delete({ where: { id: playerId } })

  console.log('✅ Player borrado')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})