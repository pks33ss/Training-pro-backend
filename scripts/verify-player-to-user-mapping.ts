import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
})
const prisma = new PrismaClient({ adapter })

/**
 * Encuentra el User asociado a un Player:
 * 1) Por email si el Player tiene email.
 * 2) Por convención ghost-<playerId>@joinsportapp.local.
 */
async function findUserForPlayer(player: {
  id: string
  email: string | null
  name: string
  lastName: string
}): Promise<{ id: string; username: string | null } | null> {
  // 1) Por email real
  if (player.email) {
    const byEmail = await prisma.user.findUnique({
      where: { email: player.email },
      select: { id: true, username: true },
    })
    if (byEmail) return byEmail
  }

  // 2) Por convención ghost
  const byGhost = await prisma.user.findUnique({
    where: { email: `ghost-${player.id}@joinsportapp.local` },
    select: { id: true, username: true },
  })
  if (byGhost) return byGhost

  return null
}

async function main() {
  const players = await prisma.player.findMany({
    select: { id: true, name: true, lastName: true, email: true, teamId: true },
  })

  console.log(`Total Players: ${players.length}\n`)

  let matched = 0
  let unmatched = 0
  const missing: any[] = []

  for (const p of players) {
    const user = await findUserForPlayer(p)
    if (user) {
      matched++
    } else {
      unmatched++
      missing.push({ player: p, reason: 'No se encontró User' })
    }
  }

  console.log(`✅ Con User correspondiente: ${matched}`)
  console.log(`❌ Sin User correspondiente: ${unmatched}\n`)

  if (missing.length > 0) {
    console.log('⚠️ Players sin User:')
    missing.forEach(({ player }) => {
      console.log(`   Player ${player.id}: ${player.name} ${player.lastName} (email: ${player.email ?? 'null'})`)
    })
  }

  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})