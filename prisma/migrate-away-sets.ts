/**
 * Migración one-shot: invierte homeScore <-> awayScore en PadelSet
 * de partidos con location = 'AWAY'.
 *
 * Motivo: cambiamos el significado de PadelSet.homeScore/awayScore
 * de "nuestro/rival" a "local/visitante". Los AWAY ya guardados
 * están en el formato viejo (homeScore = nuestro, awayScore = rival)
 * y hay que invertirlos.
 *
 * Uso:
 *   npx ts-node prisma/migrate-away-sets.ts --dry-run
 *   npx ts-node prisma/migrate-away-sets.ts
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const DRY_RUN = process.argv.includes('--dry-run')

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== MIGRACIÓN REAL ===')

  const sets = await prisma.padelSet.findMany({
    where: {
      subMatch: {
        match: {
          location: 'AWAY',
        },
      },
    },
    select: {
      id: true,
      order: true,
      homeScore: true,
      awayScore: true,
      subMatch: {
        select: {
          id: true,
          match: {
            select: {
              id: true,
              opponent: true,
              location: true,
            },
          },
        },
      },
    },
  })

  console.log(`Encontrados ${sets.length} sets en partidos AWAY.`)

  if (sets.length === 0) {
    console.log('Nada que migrar.')
    return
  }

  let migrated = 0
  for (const s of sets) {
    if (s.homeScore === s.awayScore) continue

    if (DRY_RUN) {
      console.log(
        `[dry] set ${s.id} (match ${s.subMatch.match.id}, vs ${s.subMatch.match.opponent}): ${s.homeScore}-${s.awayScore} → ${s.awayScore}-${s.homeScore}`,
      )
    } else {
      await prisma.padelSet.update({
        where: { id: s.id },
        data: {
          homeScore: s.awayScore,
          awayScore: s.homeScore,
        },
      })
    }
    migrated++
  }

  console.log(
    `\n${DRY_RUN ? '[dry] se invertirían' : 'Invertidos'} ${migrated} sets.`,
  )
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })