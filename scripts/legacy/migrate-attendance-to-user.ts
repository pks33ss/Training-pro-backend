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
  console.log('=== MIGRACIÓN: Attendance.playerId → userId ===\n')

  // 1) Buscar los Attendance sin userId
  const pending = await prisma.attendance.findMany({
    where: { userId: null },
    select: {
      id: true,
      playerId: true,
      sessionId: true,
      player: {
        select: { id: true, email: true, name: true, lastName: true },
      },
    },
  })

  console.log(`Attendance pendientes de migrar: ${pending.length}\n`)

  let migrated = 0
  let failed = 0
  const errors: any[] = []

  for (const att of pending) {
    if (!att.player) {
      console.log(`   ⚠️ Attendance ${att.id} sin Player asociado`)
      failed++
      errors.push({ attendanceId: att.id, reason: 'Player no encontrado' })
      continue
    }

    const userId = await findUserForPlayer(att.player)

    if (!userId) {
      console.log(`   ❌ No se encontró User para Player ${att.player.id} (${att.player.name} ${att.player.lastName})`)
      failed++
      errors.push({
        attendanceId: att.id,
        playerId: att.player.id,
        reason: 'User no encontrado',
      })
      continue
    }

    await prisma.attendance.update({
      where: { id: att.id },
      data: { userId },
    })
    migrated++

    if (migrated % 20 === 0) {
      console.log(`   Progreso: ${migrated}/${pending.length}`)
    }
  }

  console.log(`\n✅ Migrados: ${migrated}`)
  console.log(`❌ Fallidos: ${failed}`)

  if (errors.length > 0) {
    console.log('\n⚠️ Errores:')
    errors.forEach((e) => console.log(`   - ${JSON.stringify(e)}`))
  }

  // Verificación final
  const stillPending = await prisma.attendance.count({
    where: { userId: null },
  })
  console.log(`\nVerificación: ${stillPending} Attendance aún sin userId`)

  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})