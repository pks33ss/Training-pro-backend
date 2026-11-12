// backend/src/common/license-sport.ts
//
// Helpers de asignación automática de `licenseSport` a usuarios, clubes
// y equipos cuando están en licencia BETA.
//
// Regla de negocio:
//  - Solo aplica a licenseType === 'BETA'.
//  - Si el registro ya tiene `licenseSport`, no se toca.
//  - Si está vacío (null), se le asigna el `sport` recibido.
//  - Los métodos son idempotentes y no lanzan si ya está asignado.

import { PrismaClient, Sport } from '@prisma/client'

type PrismaLike = PrismaClient

async function assignUserLicenseSport(
  prisma: PrismaLike,
  userId: string,
  sport: Sport,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { licenseType: true, licenseSport: true },
  })
  if (!user) return
  if (user.licenseType !== 'BETA') return
  if (user.licenseSport != null) return
  await prisma.user.update({
    where: { id: userId },
    data: { licenseSport: sport },
  })
}

async function assignClubLicenseSport(
  prisma: PrismaLike,
  clubId: string,
  sport: Sport,
): Promise<void> {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { licenseType: true, licenseSport: true },
  })
  if (!club) return
  if (club.licenseType !== 'BETA') return
  if (club.licenseSport != null) return
  await prisma.club.update({
    where: { id: clubId },
    data: { licenseSport: sport },
  })
}

async function assignTeamLicenseSport(
  prisma: PrismaLike,
  teamId: string,
  sport: Sport,
): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { licenseType: true, licenseSport: true },
  })
  if (!team) return
  if (team.licenseType !== 'BETA') return
  if (team.licenseSport != null) return
  await prisma.team.update({
    where: { id: teamId },
    data: { licenseSport: sport },
  })
}

export async function ensureLicenseSportForUser(
  prisma: PrismaLike,
  userId: string,
  sport: Sport | null | undefined,
): Promise<void> {
  if (!sport) return
  try {
    await assignUserLicenseSport(prisma, userId, sport)
  } catch (err) {
    console.error('[license-sport] Error asignando licenseSport a user:', err)
  }
}

export async function ensureLicenseSportForClub(
  prisma: PrismaLike,
  clubId: string,
  sport: Sport | null | undefined,
): Promise<void> {
  if (!sport) return
  try {
    await assignClubLicenseSport(prisma, clubId, sport)
  } catch (err) {
    console.error('[license-sport] Error asignando licenseSport a club:', err)
  }
}

export async function ensureLicenseSportForTeam(
  prisma: PrismaLike,
  teamId: string,
  sport: Sport | null | undefined,
): Promise<void> {
  if (!sport) return
  try {
    await assignTeamLicenseSport(prisma, teamId, sport)
  } catch (err) {
    console.error('[license-sport] Error asignando licenseSport a team:', err)
  }
}

/**
 * Helper combinado: cuando un usuario se une a un equipo nuevo, intenta
 * asignar el licenseSport al user, al team y al club del team.
 */
export async function ensureLicenseSportOnTeamJoin(
  prisma: PrismaLike,
  userId: string,
  teamId: string,
): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { sport: true, clubId: true },
  })
  if (!team) return

  await Promise.all([
    ensureLicenseSportForUser(prisma, userId, team.sport),
    ensureLicenseSportForTeam(prisma, teamId, team.sport),
    ensureLicenseSportForClub(prisma, team.clubId, team.sport),
  ])
}