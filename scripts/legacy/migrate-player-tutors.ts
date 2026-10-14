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
  console.log('=== MIGRACIÓN: PlayerTutor → TutorRelationship ===\n')

  const playerTutors = await prisma.playerTutor.findMany({
    include: {
      player: {
        select: { id: true, email: true, name: true, lastName: true },
      },
      user: {
        select: { id: true, name: true, lastName: true },
      },
    },
  })

  console.log(`PlayerTutor encontrados: ${playerTutors.length}\n`)

  let migrated = 0
  let skipped = 0

  for (const pt of playerTutors) {
    // 1) Buscar el User del player
    const playerUserId = await findUserForPlayer(pt.player)
    if (!playerUserId) {
      console.log(`   ⚠️ Player ${pt.player.id} sin User → saltando`)
      skipped++
      continue
    }

    // 2) Determinar el tutorUserId
    //    - Si pt.userId existe → usa ese User
    //    - Si no → no se puede migrar (necesitamos un User tutor)
    if (!pt.userId) {
      console.log(
        `   ⚠️ PlayerTutor ${pt.id} sin userId (${pt.name} ${pt.lastName}) → saltando`,
      )
      skipped++
      continue
    }

    // 3) Comprobar si ya existe la TutorRelationship
    const existing = await prisma.tutorRelationship.findFirst({
      where: {
        tutorUserId: pt.userId,
        playerUserId: playerUserId,
      },
    })

    if (existing) {
      console.log(`   ℹ️ Ya existe TutorRelationship para ${pt.userId} → ${playerUserId}`)
      skipped++
      continue
    }

    // 4) Crear la TutorRelationship
    await prisma.tutorRelationship.create({
      data: {
        tutorUserId: pt.userId,
        playerUserId: playerUserId,
        relationship: pt.relationship,
        canPickUp: pt.canPickUp,
        isEmergencyContact: pt.isEmergencyContact,
        status: 'ACTIVE',
        requestedById: pt.userId,
        approvedById: pt.userId,
      },
    })

    console.log(
      `   ✅ ${pt.name} ${pt.lastName} (${pt.relationship}) → ${playerUserId}`,
    )
    migrated++
  }

  console.log(`\n✅ Migrados: ${migrated}`)
  console.log(`ℹ️ Saltados: ${skipped}`)

  // Verificación
  const totalRel = await prisma.tutorRelationship.count()
  console.log(`\nTutorRelationship totales ahora: ${totalRel}`)

  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})