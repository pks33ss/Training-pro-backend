import { PrismaService } from '../../prisma/prisma.service'

/**
 * Garantiza que el usuario es miembro del club al que pertenece el equipo.
 *
 * - Si el user YA tiene ClubMember en ese club → no hace nada (respeta su rol).
 * - Si NO lo tiene → crea uno con rol `MEMBER`.
 *
 * Se debe llamar SIEMPRE que se cree una TeamMembership nueva.
 *
 * Es idempotente: puedes llamarlo varias veces sin problema.
 */
export async function ensureClubMemberForTeam(
  prisma: PrismaService,
  userId: string,
  teamId: string,
): Promise<void> {
  // 1) Buscar el clubId del equipo
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { clubId: true },
  })

  if (!team) {
    // El equipo no existe → no hacemos nada. Si esto pasa, es un bug del caller.
    console.warn(`⚠️ ensureClubMemberForTeam: team ${teamId} no encontrado`)
    return
  }

  // 2) ¿Ya existe ClubMember?
  const existing = await prisma.clubMember.findFirst({
    where: {
      userId,
      clubId: team.clubId,
    },
  })

  if (existing) {
    // Ya existe. Si estaba desactivado, lo reactivamos (por si volvió al club).
    if (!existing.isActive) {
      await prisma.clubMember.update({
        where: { id: existing.id },
        data: { isActive: true },
      })
    }
    return
  }

  // 3) Crear ClubMember con rol MEMBER
  await prisma.clubMember.create({
    data: {
      userId,
      clubId: team.clubId,
      role: 'MEMBER',
      isActive: true,
    },
  })
}