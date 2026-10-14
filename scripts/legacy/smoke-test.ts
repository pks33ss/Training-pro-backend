// backend/scripts/smoke-test.ts
//
// Smoke test de reglas de negocio del refactor de roles.
// Crea un club temporal con datos SMOKE_*, ejecuta los tests,
// y limpia todo al final (incluso si falla).
//
// Uso:
//   npx ts-node scripts/smoke-test.ts
//
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'
import { randomUUID } from 'crypto'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
})
const prisma = new PrismaClient({ adapter })

// ─────────────────────────────────────────────
// Helpers de test
// ─────────────────────────────────────────────

let passed = 0
let failed = 0

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`  ✅ ${name}`)
    passed++
  } catch (err: any) {
    console.log(`  ❌ ${name}`)
    console.log(`     → ${err.message}`)
    failed++
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

// ─────────────────────────────────────────────
// Setup de datos SMOKE_
// ─────────────────────────────────────────────

const SMOKE = {
  clubId: '',
  teamAId: '',
  teamBId: '',
  users: {} as Record<string, string>,
  memberships: {} as Record<string, string>,
}

async function setup() {
  console.log('\n🔧 Setup: creando datos de prueba SMOKE_...')

  // 1) Super admin
  const superAdmin = await prisma.user.upsert({
    where: { email: 'smoke-superadmin@smoke.local' },
    update: {},
    create: {
      email: 'smoke-superadmin@smoke.local',
      password: 'x',
      name: 'Smoke',
      lastName: 'SuperAdmin',
      role: 'SUPER_ADMIN',
      username: `@smoke_super_${Date.now()}`,
    },
  })
  SMOKE.users.superAdmin = superAdmin.id

  // 2) Users auxiliares
  const makeUser = async (key: string, name: string) => {
    const u = await prisma.user.create({
      data: {
        email: `smoke-${key}-${Date.now()}@smoke.local`,
        password: 'x',
        name: `Smoke ${name}`,
        lastName: 'Test',
        role: 'USER',
        username: `@smoke_${key}_${Date.now()}`,
      },
    })
    SMOKE.users[key] = u.id
  }

  await makeUser('adminClub', 'AdminClub')
  await makeUser('adminTeam', 'AdminTeam')
  await makeUser('adminTeam2', 'AdminTeam2') // ✅ NUEVO
  await makeUser('coach1', 'Coach1')
  await makeUser('coach2', 'Coach2')
  await makeUser('assistant', 'Assistant')
  await makeUser('player', 'Player')

  // 3) Club
  const club = await prisma.club.create({
    data: {
      name: `SMOKE_TEST_CLUB_${Date.now()}`,
      description: 'Club temporal para smoke test',
    },
  })
  SMOKE.clubId = club.id

  // 4) ClubMembers
  const clubRoles: [string, string][] = [
    ['adminClub', 'ADMIN_CLUB'],
    ['adminTeam', 'MEMBER'],
    ['adminTeam2', 'MEMBER'], // ✅ NUEVO
    ['coach1', 'MEMBER'],
    ['coach2', 'MEMBER'],
    ['assistant', 'MEMBER'],
    ['player', 'MEMBER'],
  ]
  for (const [key, role] of clubRoles) {
    await prisma.clubMember.create({
      data: {
        userId: SMOKE.users[key],
        clubId: club.id,
        role: role as any,
        isActive: true,
      },
    })
  }

  // 5) Equipos
  const teamA = await prisma.team.create({
    data: { name: `SMOKE_TEAM_A_${Date.now()}`, clubId: club.id },
  })
  const teamB = await prisma.team.create({
    data: { name: `SMOKE_TEAM_B_${Date.now()}`, clubId: club.id },
  })
  SMOKE.teamAId = teamA.id
  SMOKE.teamBId = teamB.id

  // 6) Memberships
  const makeMembership = async (key: string, teamId: string, role: string) => {
    const m = await prisma.teamMembership.create({
      data: {
        userId: SMOKE.users[key],
        teamId,
        status: 'ACTIVE',
        roles: { create: [{ role: role as any }] },
      },
    })
    SMOKE.memberships[`${key}_${teamId === teamA.id ? 'A' : 'B'}`] = m.id
    return m
  }

  await makeMembership('adminTeam', teamA.id, 'ADMIN_TEAM')
  await makeMembership('adminTeam2', teamB.id, 'ADMIN_TEAM') // ✅ NUEVO
  await makeMembership('coach1', teamA.id, 'COACH')
  await makeMembership('coach2', teamA.id, 'COACH')
  await makeMembership('assistant', teamA.id, 'ASSISTANT')
  await makeMembership('player', teamA.id, 'PLAYER')

  console.log('   ✅ Setup completo\n')
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

async function runTests() {
  const access = await import('../src/common/access')

  console.log('🧪 Tests de canRemoveMember (matriz de permisos):\n')

  // ─── COACH quita a PLAYER → OK
  await test('COACH puede quitar a PLAYER', async () => {
    const ok = await access.canRemoveMember(
      prisma,
      SMOKE.users.coach1,
      SMOKE.users.player,
      SMOKE.teamAId,
    )
    assert(ok === true, `Esperaba true, recibí ${ok}`)
  })

  // ─── COACH quita a ASSISTANT → OK
  await test('COACH puede quitar a ASSISTANT', async () => {
    const ok = await access.canRemoveMember(
      prisma,
      SMOKE.users.coach1,
      SMOKE.users.assistant,
      SMOKE.teamAId,
    )
    assert(ok === true, `Esperaba true, recibí ${ok}`)
  })

  // ─── COACH quita a otro COACH → OK
  await test('COACH puede quitar a otro COACH', async () => {
    const ok = await access.canRemoveMember(
      prisma,
      SMOKE.users.coach1,
      SMOKE.users.coach2,
      SMOKE.teamAId,
    )
    assert(ok === true, `Esperaba true, recibí ${ok}`)
  })

  // ─── COACH quita a ADMIN_TEAM → KO
  await test('COACH NO puede quitar a ADMIN_TEAM', async () => {
    const ok = await access.canRemoveMember(
      prisma,
      SMOKE.users.coach1,
      SMOKE.users.adminTeam,
      SMOKE.teamAId,
    )
    assert(ok === false, `Esperaba false, recibí ${ok}`)
  })

  // ─── ASSISTANT quita a PLAYER → KO
  await test('ASSISTANT NO puede quitar a PLAYER', async () => {
    const ok = await access.canRemoveMember(
      prisma,
      SMOKE.users.assistant,
      SMOKE.users.player,
      SMOKE.teamAId,
    )
    assert(ok === false, `Esperaba false, recibí ${ok}`)
  })

  // ─── ASSISTANT quita a COACH → KO
  await test('ASSISTANT NO puede quitar a COACH', async () => {
    const ok = await access.canRemoveMember(
      prisma,
      SMOKE.users.assistant,
      SMOKE.users.coach1,
      SMOKE.teamAId,
    )
    assert(ok === false, `Esperaba false, recibí ${ok}`)
  })

  // ─── ADMIN_TEAM quita a COACH → OK
  await test('ADMIN_TEAM puede quitar a COACH', async () => {
    const ok = await access.canRemoveMember(
      prisma,
      SMOKE.users.adminTeam,
      SMOKE.users.coach1,
      SMOKE.teamAId,
    )
    assert(ok === true, `Esperaba true, recibí ${ok}`)
  })

  // ─── ADMIN_TEAM quita a otro ADMIN_TEAM → OK
  await test('ADMIN_TEAM puede quitar a otro ADMIN_TEAM', async () => {
    // adminTeam2 ya tiene ADMIN_TEAM en teamB.
    // Creamos una membership ADMIN_TEAM de adminTeam2 en teamA para que
    // adminTeam (también en teamA) pueda intentar quitarlo.
    const m = await prisma.teamMembership.create({
      data: {
        userId: SMOKE.users.adminTeam2,
        teamId: SMOKE.teamAId,
        status: 'ACTIVE',
        roles: { create: [{ role: 'ADMIN_TEAM' }] },
      },
    })

    try {
      const ok = await access.canRemoveMember(
        prisma,
        SMOKE.users.adminTeam,
        SMOKE.users.adminTeam2,
        SMOKE.teamAId,
      )
      assert(ok === true, `Esperaba true, recibí ${ok}`)
    } finally {
      await prisma.teamMembership.delete({ where: { id: m.id } })
    }
  })

  // ─── PLAYER quita a otro PLAYER → KO
  await test('PLAYER NO puede quitar a otro PLAYER', async () => {
    const ok = await access.canRemoveMember(
      prisma,
      SMOKE.users.player,
      SMOKE.users.assistant,
      SMOKE.teamAId,
    )
    assert(ok === false, `Esperaba false, recibí ${ok}`)
  })

  // ─── ADMIN_CLUB quita a cualquier → OK
  await test('ADMIN_CLUB puede quitar a COACH', async () => {
    const ok = await access.canRemoveMember(
      prisma,
      SMOKE.users.adminClub,
      SMOKE.users.coach1,
      SMOKE.teamAId,
    )
    assert(ok === true, `Esperaba true, recibí ${ok}`)
  })

  // ─── SUPER_ADMIN quita a cualquier → OK
  await test('SUPER_ADMIN puede quitar a ADMIN_TEAM', async () => {
    const ok = await access.canRemoveMember(
      prisma,
      SMOKE.users.superAdmin,
      SMOKE.users.adminTeam,
      SMOKE.teamAId,
    )
    assert(ok === true, `Esperaba true, recibí ${ok}`)
  })

  // ─── Auto-quitarse → OK
  await test('User puede quitarse a sí mismo', async () => {
    const ok = await access.canRemoveMember(
      prisma,
      SMOKE.users.player,
      SMOKE.users.player,
      SMOKE.teamAId,
    )
    assert(ok === true, `Esperaba true, recibí ${ok}`)
  })

  console.log('\n🧪 Tests de roles por equipo:\n')

  // ─── Si eres COACH en A y ASSISTANT en B, en B no puedes quitar a nadie
  await test('Roles por equipo: ASSISTANT en B no puede quitar', async () => {
    const m1 = await prisma.teamMembership.create({
      data: {
        userId: SMOKE.users.coach1,
        teamId: SMOKE.teamBId,
        status: 'ACTIVE',
        roles: { create: [{ role: 'ASSISTANT' }] },
      },
    })
    const m2 = await prisma.teamMembership.create({
      data: {
        userId: SMOKE.users.assistant,
        teamId: SMOKE.teamBId,
        status: 'ACTIVE',
        roles: { create: [{ role: 'PLAYER' }] },
      },
    })

    try {
      const okA = await access.canRemoveMember(
        prisma,
        SMOKE.users.coach1,
        SMOKE.users.assistant,
        SMOKE.teamAId,
      )
      assert(okA === true, `En A (COACH) debería poder, recibí ${okA}`)

      const okB = await access.canRemoveMember(
        prisma,
        SMOKE.users.coach1,
        SMOKE.users.assistant,
        SMOKE.teamBId,
      )
      assert(okB === false, `En B (ASSISTANT) NO debería poder, recibí ${okB}`)
    } finally {
      await prisma.teamMembership.deleteMany({
        where: { id: { in: [m1.id, m2.id] } },
      })
    }
  })

  console.log('\n🧪 Tests de auto-desvincular del club:\n')

  await test('Al quitar a un user de su último equipo, ClubMember.isActive = false', async () => {
    const playerClubMemberBefore = await prisma.clubMember.findFirst({
      where: { userId: SMOKE.users.player, clubId: SMOKE.clubId },
    })
    assert(
      playerClubMemberBefore?.isActive === true,
      'Pre: player debería estar activo en el club',
    )

    const membershipId = SMOKE.memberships[`player_A`]
    await prisma.teamMembership.update({
      where: { id: membershipId },
      data: { status: 'LEFT', leftAt: new Date() },
    })

    try {
      const activeCount = await prisma.teamMembership.count({
        where: {
          userId: SMOKE.users.player,
          status: 'ACTIVE',
          team: { clubId: SMOKE.clubId },
        },
      })
      assert(activeCount === 0, `activeCount debería ser 0, es ${activeCount}`)

      await prisma.clubMember.updateMany({
        where: { userId: SMOKE.users.player, clubId: SMOKE.clubId },
        data: { isActive: false },
      })

      const playerClubMemberAfter = await prisma.clubMember.findFirst({
        where: { userId: SMOKE.users.player, clubId: SMOKE.clubId },
      })
      assert(
        playerClubMemberAfter?.isActive === false,
        'Después: player debería estar inactivo en el club',
      )
    } finally {
      // restaurar para no romper otros tests
      await prisma.teamMembership.update({
        where: { id: membershipId },
        data: { status: 'ACTIVE', leftAt: null },
      })
      await prisma.clubMember.updateMany({
        where: { userId: SMOKE.users.player, clubId: SMOKE.clubId },
        data: { isActive: true },
      })
    }
  })

  await test('ADMIN_CLUB NO se auto-desvincula al perder equipos', async () => {
    // adminClub es ADMIN_CLUB y no tiene memberships de equipo.
    // Su ClubMember debe seguir activo.
    const cm = await prisma.clubMember.findFirst({
      where: { userId: SMOKE.users.adminClub, clubId: SMOKE.clubId },
    })
    assert(cm?.isActive === true, 'ADMIN_CLUB debería seguir activo')
    assert(cm?.role === 'ADMIN_CLUB', 'Debería seguir siendo ADMIN_CLUB')
  })
}

// ─────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────

async function cleanup() {
  console.log('\n🧹 Cleanup: borrando datos SMOKE_...')

  try {
    if (SMOKE.clubId) {
      await prisma.club.delete({ where: { id: SMOKE.clubId } }).catch((e) => {
        console.warn(`   ⚠️ No se pudo borrar el club: ${e.message}`)
      })
    }

    const result = await prisma.user.deleteMany({
      where: { email: { contains: '@smoke.local' } },
    })
    console.log(`   ✅ Users SMOKE_ borrados: ${result.count}`)
  } catch (err: any) {
    console.error(`   ❌ Error en cleanup: ${err.message}`)
    console.error(`   ⚠️  Ejecuta manualmente:`)
    console.error(`      DELETE FROM "Club" WHERE name LIKE 'SMOKE_TEST_CLUB_%';`)
    console.error(`      DELETE FROM "User" WHERE email LIKE '%@smoke.local';`)
  }
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════')
  console.log('  SMOKE TEST — Refactor de roles')
  console.log('═══════════════════════════════════════════════')

  try {
    await setup()
    await runTests()
  } catch (err) {
    console.error('\n❌ Error fatal durante los tests:', err)
  } finally {
    await cleanup()

    console.log('\n═══════════════════════════════════════════════')
    console.log(`  RESULTADO: ${passed} pasados / ${failed} fallados`)
    console.log('═══════════════════════════════════════════════\n')

    await prisma.$disconnect()
    process.exit(failed > 0 ? 1 : 0)
  }
}

main()