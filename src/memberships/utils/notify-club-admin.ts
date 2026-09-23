import { PrismaService } from '../../prisma/prisma.service'

/**
 * Notifica a los admins del club que un coach/assistant ha abandonado un equipo.
 *
 * ⚠️ De momento solo hace un console.log. Cuando configuremos SMTP,
 * esta función enviará un email real.
 */
export async function notifyClubAdminOfDeparture(
  prisma: PrismaService,
  params: {
    clubId: string
    teamName: string
    memberName: string
    memberRole: string
    departedAt: Date
  },
): Promise<void> {
  // 1) Buscar admins del club
  const admins = await prisma.clubMember.findMany({
    where: {
      clubId: params.clubId,
      role: 'ADMIN_CLUB',
      isActive: true,
    },
    include: {
      user: {
        select: { id: true, email: true, name: true, lastName: true },
      },
    },
  })

  if (admins.length === 0) {
    console.warn(
      `⚠️ No hay admins en el club ${params.clubId} para notificar la salida de ${params.memberName}`,
    )
    return
  }

  // 2) Aquí irá el envío real de emails cuando tengamos SMTP
  for (const admin of admins) {
    console.log(
      `📧 [PENDIENTE SMTP] Email a ${admin.user.email}: ` +
        `${params.memberName} (${params.memberRole}) ha abandonado el equipo "${params.teamName}" ` +
        `el ${params.departedAt.toLocaleDateString('es-ES')}`,
    )
  }
}