// backend/src/club/utils/ensure-club-member.ts
import { PrismaService } from '../../prisma/prisma.service'
import { resolveClubRoleId } from '../../permissions/resolve-role-id'

/**
 * Garantiza que el usuario es miembro del club al que pertenece el equipo.
 *
 * - Si el user YA tiene ClubMember en ese club → no hace nada (respeta su rol).
 * - Si NO lo tiene → crea uno con rol `MEMBER`.
 *
 * Se debe llamar SIEMPRE que se cree una TeamMembership nueva.
 * Es idempotente: puedes llamarlo varias veces sin problema.
 */
export async function ensureClubMemberForTeam(
  prisma: PrismaService,
  userId: string,
  teamId: string,
): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { clubId: true },
  })

  if (!team) {
    console.warn(`⚠️ ensureClubMemberForTeam: team ${teamId} no encontrado`)
    return
  }

  const existing = await prisma.clubMember.findFirst({
    where: { userId, clubId: team.clubId },
  })

  if (existing) {
    if (!existing.isActive) {
      await prisma.clubMember.update({
        where: { id: existing.id },
        data: { isActive: true },
      })
    }
    return
  }

  const memberRoleId = await resolveClubRoleId(prisma, team.clubId, 'MEMBER')

  await prisma.clubMember.create({
    data: {
      userId,
      clubId: team.clubId,
      roleId: memberRoleId,
      isActive: true,
    },
  })
}