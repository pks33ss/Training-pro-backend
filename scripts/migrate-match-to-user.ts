import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
})
const prisma = new PrismaClient({ adapter })

async function findUserForPlayer(player: {
  id: string
  email: string | null
}): Promise<string | null> {
  if (player.email) {
    const byEmail = await prisma.user.findUnique({
      where: { email: player.email },
      select: { id: true },
    })
    if (byEmail) return byEmail.id
  }
  const byGhost = await prisma.user.findUnique({
    where: { email: `ghost-${player.id}@joinsportapp.local` },
    select: { id: true },
  })
  if (byGhost) return byGhost.id
  return null
}

async function main() {
  console.log('=== MIGRACIÓN: MatchPlayerStats → userId ===\n')

  const pendingStats = await prisma.matchPlayerStats.findMany({
    where: { userId: null },
    select: {
      id: true,
      playerId: true,
      player: {
        select: { id: true, email: true, name: true, lastName: true },
      },
    },
  })

  console.log(`MatchPlayerStats pendientes: ${pendingStats.length}`)
  let migratedStats = 0
  let failedStats = 0

  for (const s of pendingStats) {
    if (!s.player) {
      console.log(`   ⚠️ MatchPlayerStats ${s.id} sin Player`)
      failedStats++
      continue
    }
    const userId = await findUserForPlayer(s.player)
    if (!userId) {
      console.log(`   ❌ No User para Player ${s.player.id}`)
      failedStats++
      continue
    }
    await prisma.matchPlayerStats.update({
      where: { id: s.id },
      data: { userId },
    })
    migratedStats++
  }

  console.log(`   ✅ Migrados: ${migratedStats}, ❌ Fallidos: ${failedStats}\n`)

  console.log('=== MIGRACIÓN: MatchCallup → userId ===\n')

  const pendingCallups = await prisma.matchCallup.findMany({
    where: { userId: null },
    select: {
      id: true,
      playerId: true,
      player: {
        select: { id: true, email: true, name: true, lastName: true },
      },
    },
  })

  console.log(`MatchCallup pendientes: ${pendingCallups.length}`)
  let migratedCallups = 0
  let failedCallups = 0

  for (const c of pendingCallups) {
    if (!c.player) {
      console.log(`   ⚠️ MatchCallup ${c.id} sin Player`)
      failedCallups++
      continue
    }
    const userId = await findUserForPlayer(c.player)
    if (!userId) {
      console.log(`   ❌ No User para Player ${c.player.id}`)
      failedCallups++
      continue
    }
    await prisma.matchCallup.update({
      where: { id: c.id },
      data: { userId },
    })
    migratedCallups++
  }

  console.log(`   ✅ Migrados: ${migratedCallups}, ❌ Fallidos: ${failedCallups}\n`)

  // Verificación
  const [stillStats, stillCallups] = await Promise.all([
    prisma.matchPlayerStats.count({ where: { userId: null } }),
    prisma.matchCallup.count({ where: { userId: null } }),
  ])

  console.log('=== VERIFICACIÓN ===')
  console.log(`MatchPlayerStats sin userId: ${stillStats}`)
  console.log(`MatchCallup sin userId: ${stillCallups}`)

  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})