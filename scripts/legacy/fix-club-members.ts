import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🔍 Buscando TeamMemberships sin ClubMember correspondiente...\n')

  // Todas las memberships activas
  const memberships = await prisma.teamMembership.findMany({
    where: { status: 'ACTIVE' },
    include: {
      team: { select: { clubId: true } },
      user: { select: { id: true, name: true, lastName: true, email: true } },
    },
  })

  let fixed = 0
  let alreadyOk = 0

  for (const m of memberships) {
    const exists = await prisma.clubMember.findFirst({
      where: {
        userId: m.userId,
        clubId: m.team.clubId,
      },
    })

    if (exists) {
      alreadyOk++
      continue
    }

    await prisma.clubMember.create({
      data: {
        userId: m.userId,
        clubId: m.team.clubId,
        role: 'MEMBER',
        isActive: true,
      },
    })

    console.log(
      `   ✅ ${m.user.name} ${m.user.lastName} (${m.user.email ?? 'sin email'}) → añadido al club`,
    )
    fixed++
  }

  console.log(`\n📊 Resumen:`)
  console.log(`   Ya tenían ClubMember: ${alreadyOk}`)
  console.log(`   Corregidos: ${fixed}`)
  console.log(`   Total procesados: ${memberships.length}\n`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})