import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  const [
    attendances,
    matchPlayerStats,
    matchCallups,
    teamMemberships,
    users,
    tutorRelationships,
    teams,
    sessions,
    matches,
  ] = await Promise.all([
    prisma.attendance.count(),
    prisma.matchPlayerStats.count(),
    prisma.matchCallup.count(),
    prisma.teamMembership.count(),
    prisma.user.count(),
    prisma.tutorRelationship.count(),
    prisma.team.count(),
    prisma.session.count(),
    prisma.match.count(),
  ])

  console.log('=== ESTADO ACTUAL (sin Player) ===')
  console.log('User:                ', users)
  console.log('Team:                ', teams)
  console.log('TeamMembership:      ', teamMemberships)
  console.log('TutorRelationship:   ', tutorRelationships)
  console.log('Session:             ', sessions)
  console.log('Attendance:          ', attendances)
  console.log('Match:               ', matches)
  console.log('MatchCallup:         ', matchCallups)
  console.log('MatchPlayerStats:    ', matchPlayerStats)

  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})