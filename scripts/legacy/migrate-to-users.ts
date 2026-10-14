import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config' // Asegura que carga DATABASE_URL desde .env

console.log('🔍 DATABASE_URL_UNPOOLED:', process.env.DATABASE_URL_UNPOOLED ? '✅ definida' : '❌ undefined')
console.log('🔍 Longitud:', process.env.DATABASE_URL_UNPOOLED?.length || 0)

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
})

const prisma = new PrismaClient({ adapter })

// ============================================
// HELPERS
// ============================================

/**
 * Genera un username único a partir del nombre y apellido.
 * Ej: "Juan Pérez" → "@juanperez", si existe → "@juanperez2", etc.
 */
async function generateUniqueUsername(
  name: string,
  lastName: string,
  excludeUserId?: string,
): Promise<string> {
  const base = (name[0] + lastName)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[^a-z0-9]/g, '')

  if (!base) return `@user${Date.now()}`

  let username = `@${base}`
  let counter = 1

  while (true) {
    const existing = await prisma.user.findUnique({ where: { username } })
    if (!existing || existing.id === excludeUserId) {
      return username
    }
    counter++
    username = `@${base}${counter}`
  }
}

/**
 * Genera un código único para invitaciones.
 * Formato: FPM-XXXX-XXXX (con caracteres alfanuméricos).
 */
function generateInvitationCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sin I, O, 0, 1 para evitar confusiones
  const segment = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `JSP-${segment()}-${segment()}`
}

// ============================================
// PASO 1: Generar usernames para Users existentes
// ============================================

async function generateUsernames() {
  console.log('\n🔤 Paso 1: Generando usernames para Users existentes...')

  const users = await prisma.user.findMany({
    where: { username: null },
  })

  console.log(`   Encontrados ${users.length} users sin username`)

  let updated = 0
  for (const user of users) {
    const username = await generateUniqueUsername(user.name, user.lastName, user.id)
    await prisma.user.update({
      where: { id: user.id },
      data: { username },
    })
    updated++
  }

  console.log(`   ✅ ${updated} usernames generados`)
}

// ============================================
// PASO 2: Migrar TeamMember → TeamMembership
// ============================================

async function migrateTeamMembers() {
  console.log('\n👥 Paso 2: Migrando TeamMember → TeamMembership...')

  const teamMembers = await prisma.teamMember.findMany()

  console.log(`   Encontrados ${teamMembers.length} TeamMember`)

  let created = 0
  let skipped = 0

  for (const tm of teamMembers) {
    // Verificar si ya existe el membership
    const existing = await prisma.teamMembership.findFirst({
      where: {
        userId: tm.userId,
        teamId: tm.teamId,
      },
    })

    if (existing) {
      skipped++
      continue
    }

    await prisma.teamMembership.create({
      data: {
        userId: tm.userId,
        teamId: tm.teamId,
        role: tm.role === 'COACH' ? 'COACH' : 'ASSISTANT',
        status: tm.isActive ? 'ACTIVE' : 'INACTIVE',
        joinedAt: tm.joinedAt,
      },
    })
    created++
  }

  console.log(`   ✅ ${created} memberships creados, ${skipped} ya existían`)
}

// ============================================
// PASO 3: Migrar Player → User fantasma + TeamMembership
// ============================================

async function migratePlayers() {
  console.log('\n🏀 Paso 3: Migrando Player → User fantasma + TeamMembership...')

  const players = await prisma.player.findMany({
    include: {
      team: true,
    },
  })

  console.log(`   Encontrados ${players.length} Player`)

  let createdGhosts = 0
  let linkedExisting = 0
  let membershipsCreated = 0

  for (const player of players) {
    // Buscar si ya existe un User fantasma creado para este Player
    // (por ejemplo, si ya se ejecutó este script antes)
    // Usamos el email para detectarlo (si el Player tiene email)
    // O el patrón "ghost-{playerId}" (ver abajo)

    let ghostUser = null

    // 1) Si el Player tiene email, buscar User con ese email
    if (player.email) {
      ghostUser = await prisma.user.findUnique({
        where: { email: player.email },
      })
      if (ghostUser) {
        console.log(`   🔗 Player "${player.name} ${player.lastName}" ya tiene User (${player.email})`)
      }
    }

    // 2) Si no lo encontró por email, buscar ghost con el patrón
    if (!ghostUser) {
      ghostUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email: `ghost-${player.id}@joinsportapp.local` },
            // O si el email es del player, buscar por él
          ],
        },
      })
    }

    // 3) Si no existe, crearlo
    if (!ghostUser) {
      const username = await generateUniqueUsername(player.name, player.lastName)

      ghostUser = await prisma.user.create({
        data: {
          name: player.name,
          lastName: player.lastName,
          email: player.email || `ghost-${player.id}@joinsportapp.local`,
          phone: player.phone || null,
          username,
          isGhost: true,
          role: 'USER',
        },
      })
      createdGhosts++
      console.log(`   👻 Creado User fantasma: ${username} (${player.name} ${player.lastName})`)
    } else {
      linkedExisting++
    }

    // 4) Crear TeamMembership para el jugador en su equipo
    const existingMembership = await prisma.teamMembership.findFirst({
      where: {
        userId: ghostUser.id,
        teamId: player.teamId,
      },
    })

    if (!existingMembership) {
      await prisma.teamMembership.create({
        data: {
          userId: ghostUser.id,
          teamId: player.teamId,
          role: 'PLAYER',
          jerseyNumber: player.number,
          position: player.position,
          status: player.isActive ? 'ACTIVE' : 'INACTIVE',
          joinedAt: player.createdAt,
        },
      })
      membershipsCreated++
    }
  }

  console.log(`   ✅ ${createdGhosts} User fantasma creados`)
  console.log(`   ✅ ${linkedExisting} Players ya tenían User`)
  console.log(`   ✅ ${membershipsCreated} TeamMemberships creados`)
}

// ============================================
// PASO 4: Migrar PlayerTutor → TutorRelationship
// ============================================

async function migratePlayerTutors() {
  console.log('\n👨‍👩‍👧 Paso 4: Migrando PlayerTutor → TutorRelationship...')

  const tutors = await prisma.playerTutor.findMany({
    include: {
      player: true,
    },
  })

  console.log(`   Encontrados ${tutors.length} PlayerTutor`)

  let createdRelationships = 0
  let createdGhostTutors = 0
  let skipped = 0

  for (const tutor of tutors) {
    // 1) Encontrar (o crear) el User del JUGADOR
    // El jugador fue migrado en el paso 3, así que buscamos por el email fantasma o por el email real
    let playerUser = null

    if (tutor.player.email) {
      playerUser = await prisma.user.findUnique({
        where: { email: tutor.player.email },
      })
    }
    if (!playerUser) {
      playerUser = await prisma.user.findUnique({
        where: { email: `ghost-${tutor.playerId}@joinsportapp.local` },
      })
    }

    if (!playerUser) {
      console.log(`   ⚠️ No se encontró User para el Player ${tutor.playerId}, saltando`)
      skipped++
      continue
    }

    // 2) Encontrar (o crear) el User del TUTOR
    let tutorUser = null

    if (tutor.userId) {
      // El tutor ya tiene cuenta
      tutorUser = await prisma.user.findUnique({
        where: { id: tutor.userId },
      })
    }

    if (!tutorUser) {
      // Crear User fantasma para el tutor
      // Primero, comprobar si ya existe por email
      if (tutor.email) {
        tutorUser = await prisma.user.findUnique({
          where: { email: tutor.email },
        })
      }

      if (!tutorUser) {
        const username = await generateUniqueUsername(tutor.name, tutor.lastName)
        tutorUser = await prisma.user.create({
          data: {
            name: tutor.name,
            lastName: tutor.lastName,
            email: tutor.email || `ghost-tutor-${tutor.id}@joinsportapp.local`,
            phone: tutor.phone || null,
            username,
            isGhost: true,
            role: 'USER',
          },
        })
        createdGhostTutors++
        console.log(`   👻 Creado User fantasma tutor: ${username} (${tutor.name} ${tutor.lastName})`)
      }
    }

    // 3) Crear la TutorRelationship
    const existing = await prisma.tutorRelationship.findFirst({
      where: {
        tutorUserId: tutorUser.id,
        playerUserId: playerUser.id,
      },
    })

    if (existing) {
      skipped++
      continue
    }

    await prisma.tutorRelationship.create({
      data: {
        tutorUserId: tutorUser.id,
        playerUserId: playerUser.id,
        relationship: tutor.relationship || 'otro',
        canPickUp: tutor.canPickUp,
        isEmergencyContact: tutor.isEmergencyContact,
        status: 'ACTIVE', // Los existentes asumimos que están activos
        requestedById: tutorUser.id, // Auto-solicitado
      },
    })
    createdRelationships++
  }

  console.log(`   ✅ ${createdRelationships} TutorRelationships creadas`)
  console.log(`   ✅ ${createdGhostTutors} User fantasma tutor creados`)
  console.log(`   ⏭️  ${skipped} saltados (ya existían o faltaba info)`)
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('🚀 Iniciando migración a Users + Memberships\n')
  console.log('='.repeat(50))

  try {
    await generateUsernames()
    await migrateTeamMembers()
    await migratePlayers()
    await migratePlayerTutors()

    console.log('\n' + '='.repeat(50))
    console.log('✅ Migración completada con éxito\n')

    // Resumen final
    const stats = {
      users: await prisma.user.count(),
      ghosts: await prisma.user.count({ where: { isGhost: true } }),
      memberships: await prisma.teamMembership.count(),
      invitations: await prisma.pendingInvitation.count(),
      tutorRelationships: await prisma.tutorRelationship.count(),
      players: await prisma.player.count(), // aún existen (Fase 5 los borra)
    }

    console.log('📊 Estadísticas finales:')
    console.log(`   Users totales:           ${stats.users}`)
    console.log(`   Users fantasma:          ${stats.ghosts}`)
    console.log(`   TeamMemberships:         ${stats.memberships}`)
    console.log(`   TutorRelationships:      ${stats.tutorRelationships}`)
    console.log(`   Players (a migrar Fase 5): ${stats.players}`)
    console.log()
  } catch (error) {
    console.error('\n❌ Error durante la migración:')
    console.error(error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()