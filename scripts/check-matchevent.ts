// backend/scripts/check-matchevent.ts
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED!,
})
const prisma = new PrismaClient({ adapter })

;(async () => {
  const total = await prisma.matchEvent.count()
  console.log('MatchEvent total:', total)

  // Extra: por si acaso, cuántos tienen type = REBOUND
  const rebounds = await prisma.matchEvent.count({
    where: { type: 'REBOUND' as any },
  })
  console.log('MatchEvent con type=REBOUND:', rebounds)

  await prisma.$disconnect()
})()