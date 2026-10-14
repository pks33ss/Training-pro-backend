import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { MailService } from '../mail/mail.service'
import { generateInvitationCode } from './utils/generate-code'
import { CreateInvitationDto } from './dto'
import { ensureClubMemberForTeam } from '../club/utils/ensure-club-member'
import { assertCanManageMembers } from '../common/access'
import { resolveTeamRoleId } from '../permissions/resolve-role-id'

const INVITATION_EXPIRY_DAYS = 7

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name)

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  private async verifyCanInvite(userId: string, teamId: string) {
    await assertCanManageMembers(this.prisma, userId, teamId)
  }

  // ============================================
  // REGLA DE RESOLUCIÓN DE ENVÍO
  // ============================================

  private shouldSendEmailToUser(user: {
    emailNotificationsEnabled: boolean
    emailOptOut: boolean
  }): boolean {
    if (user.emailOptOut) return false
    if (!user.emailNotificationsEnabled) return false
    return true
  }

  // ============================================
  // CREAR INVITACIÓN
  // ============================================

  async create(userId: string, dto: CreateInvitationDto) {
    await this.verifyCanInvite(userId, dto.teamId)

    // Resolver roleId antes de crear la invitación
    const team = await this.prisma.team.findUnique({
      where: { id: dto.teamId },
      select: { clubId: true },
    })
    if (!team) {
      throw new NotFoundException('Equipo no encontrado')
    }

    const roleName = (dto.role || 'PLAYER') as string
    const roleId = await resolveTeamRoleId(this.prisma, team.clubId, roleName)

    let targetUserId: string | null = null
    let targetIsGhost = false
    let resolvedChannel = dto.channel || 'LINK'

    if (dto.userId) {
      const target = await this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: { id: true, isGhost: true, deletedAt: true },
      })

      if (!target || target.deletedAt) {
        throw new NotFoundException({
          code: 'USER_NOT_FOUND',
          message: 'Usuario no encontrado',
        })
      }

      targetIsGhost = target.isGhost

      if (!target.isGhost) {
        const existingMembership = await this.prisma.teamMembership.findUnique({
          where: {
            userId_teamId: { userId: target.id, teamId: dto.teamId },
          },
          select: { status: true },
        })

        if (existingMembership?.status === 'ACTIVE') {
          throw new ConflictException({
            code: 'ALREADY_IN_TEAM',
            message: 'Ese usuario ya está en el equipo',
          })
        }
      }

      targetUserId = target.id

      if (!target.isGhost && !dto.channel) {
        resolvedChannel = 'IN_APP'
      }
    } else if (dto.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: dto.email },
        select: { id: true, deletedAt: true, isGhost: true },
      })

      if (existingUser && !existingUser.deletedAt && !existingUser.isGhost) {
        const existingMembership = await this.prisma.teamMembership.findUnique({
          where: {
            userId_teamId: { userId: existingUser.id, teamId: dto.teamId },
          },
          select: { status: true },
        })

        if (existingMembership?.status === 'ACTIVE') {
          throw new ConflictException({
            code: 'ALREADY_IN_TEAM',
            message: 'Ese usuario ya está en el equipo',
          })
        }

        targetUserId = existingUser.id
        targetIsGhost = false

        if (!dto.channel) {
          resolvedChannel = 'IN_APP'
        }
      }
    }

    if (!targetUserId && !dto.email && !dto.phone) {
      throw new BadRequestException(
        'Debes proporcionar al menos un email, teléfono o userId',
      )
    }

    if (targetUserId) {
      await this.prisma.pendingInvitation.updateMany({
        where: {
          userId: targetUserId,
          teamId: dto.teamId,
          status: 'PENDING',
        },
        data: { status: 'REVOKED' },
      })
    }

    const code = generateInvitationCode()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS)

    const invitation = await this.prisma.pendingInvitation.create({
      data: {
        code,
        email: dto.email || null,
        phone: dto.phone || null,
        userId: targetUserId,
        teamId: dto.teamId,
        roleId,
        channel: resolvedChannel,
        expiresAt,
        invitedById: userId,
      },
      include: {
        team: { include: { club: true } },
        invitedBy: {
          select: { id: true, name: true, lastName: true, username: true },
        },
        user: {
          select: { id: true, name: true, lastName: true, username: true },
        },
        roleRef: { select: { id: true, name: true } },
      },
    })

    // ============================================
    // ENVÍO DE EMAIL
    // ============================================

    let emailSent = false
    let emailError: string | undefined = undefined

    if (resolvedChannel === 'EMAIL') {
      const targetEmail = dto.email || invitation.user?.username || null

      if (!targetEmail) {
        this.logger.warn(
          `Invitación ${invitation.id} marcada como EMAIL pero no hay dirección destino`,
        )
      } else {
        let shouldSend = true
        let recipientName = 'amigo/a'

        if (targetUserId) {
          const userWithPrefs = await this.prisma.user.findUnique({
            where: { id: targetUserId },
            select: {
              name: true,
              lastName: true,
              emailNotificationsEnabled: true,
              emailOptOut: true,
            },
          })

          if (userWithPrefs) {
            shouldSend = this.shouldSendEmailToUser(userWithPrefs)
            recipientName = userWithPrefs.name
              ? `${userWithPrefs.name}${userWithPrefs.lastName ? ' ' + userWithPrefs.lastName : ''}`
              : recipientName
          }
        }

        if (shouldSend) {
          const invitationLink = this.buildInvitationLink(code)
          const result = await this.mailService.sendInvitationEmail(targetEmail, {
            recipientName,
            teamName: invitation.team.name,
            clubName: invitation.team.club?.name ?? '',
            role: invitation.roleRef.name,
            inviterName: `${invitation.invitedBy.name} ${invitation.invitedBy.lastName}`,
            invitationLink,
            expiresAt: invitation.expiresAt,
          })

          emailSent = result.sent
          emailError = result.reason
        } else {
          this.logger.log(
            `Invitación ${invitation.id} NO enviada: usuario tiene emails desactivados o hizo opt-out`,
          )
        }
      }
    }

    return {
      ...invitation,
      invitationLink: this.buildInvitationLink(code),
      emailSent,
      ...(emailError ? { emailError } : {}),
    }
  }

  // ============================================
  // OBTENER INVITACIÓN POR CÓDIGO (público)
  // ============================================

  async findByCode(code: string) {
    const invitation = await this.prisma.pendingInvitation.findUnique({
      where: { code },
      include: {
        team: { include: { club: true } },
        invitedBy: {
          select: { id: true, name: true, lastName: true, username: true },
        },
        roleRef: { select: { id: true, name: true } },
      },
    })

    if (!invitation) {
      throw new NotFoundException('Invitación no encontrada')
    }

    if (invitation.status === 'PENDING' && invitation.expiresAt < new Date()) {
      await this.prisma.pendingInvitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      })
      throw new BadRequestException('La invitación ha caducado')
    }

    return invitation
  }

  // ============================================
  // MARCAR COMO USADA
  // ============================================

  async markAsUsed(code: string, userId: string) {
    const invitation = await this.prisma.pendingInvitation.findUnique({
      where: { code },
    })

    if (!invitation) {
      throw new NotFoundException('Invitación no encontrada')
    }

    if (invitation.status !== 'PENDING') {
      throw new BadRequestException(
        'La invitación ya fue usada o revocada',
      )
    }

    if (invitation.expiresAt < new Date()) {
      await this.prisma.pendingInvitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      })
      throw new BadRequestException('La invitación ha caducado')
    }

    const existingMembership = await this.prisma.teamMembership.findFirst({
      where: { userId, teamId: invitation.teamId },
    })

    if (!existingMembership) {
      const teamRoleId = invitation.roleId

      await this.prisma.teamMembership.create({
        data: {
          userId,
          teamId: invitation.teamId,
          roles: {
            create: [{ roleId: teamRoleId }],
          },
          status: 'ACTIVE',
          invitedById: invitation.invitedById,
        },
      })

      await ensureClubMemberForTeam(this.prisma, userId, invitation.teamId)
    }

    return this.prisma.pendingInvitation.update({
      where: { id: invitation.id },
      data: {
        status: 'USED',
        usedAt: new Date(),
        userId,
      },
    })
  }

  // ============================================
  // LISTAR INVITACIONES DE UN EQUIPO
  // ============================================

  async findByTeam(userId: string, teamId: string) {
    await this.verifyCanInvite(userId, teamId)

    return this.prisma.pendingInvitation.findMany({
      where: { teamId },
      include: {
        invitedBy: {
          select: { id: true, name: true, lastName: true, username: true },
        },
        user: {
          select: { id: true, name: true, lastName: true, username: true },
        },
        roleRef: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  // ============================================
  // REVOCAR INVITACIÓN
  // ============================================

  async revoke(userId: string, invitationId: string) {
    const invitation = await this.prisma.pendingInvitation.findUnique({
      where: { id: invitationId },
    })

    if (!invitation) {
      throw new NotFoundException('Invitación no encontrada')
    }

    await this.verifyCanInvite(userId, invitation.teamId)

    if (invitation.status !== 'PENDING') {
      throw new BadRequestException(
        'Solo se pueden revocar invitaciones pendientes',
      )
    }

    return this.prisma.pendingInvitation.update({
      where: { id: invitationId },
      data: { status: 'REVOKED' },
    })
  }

  // ============================================
  // UTILS
  // ============================================

  private buildInvitationLink(code: string): string {
    const baseUrl =
      process.env.FRONTEND_URL || 'https://app.joinsportapp.com'
    const cleanBase = baseUrl.replace(/\/$/, '')
    return `${cleanBase}/register?invitation=${code}`
  }

  // ============================================
  // INVITACIONES DEL USUARIO LOGUEADO
  // ============================================

  async findMineForUser(userId: string) {
    return this.prisma.pendingInvitation.findMany({
      where: {
        userId,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      include: {
        team: {
          include: {
            club: { select: { id: true, name: true, logo: true } },
          },
        },
        invitedBy: {
          select: { id: true, name: true, lastName: true, username: true },
        },
        roleRef: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async previewByCode(code: string) {
    const invitation = await this.prisma.pendingInvitation.findUnique({
      where: { code },
      include: {
        team: {
          include: {
            club: { select: { id: true, name: true, logo: true } },
          },
        },
        invitedBy: {
          select: { id: true, name: true, lastName: true, username: true },
        },
        roleRef: { select: { id: true, name: true } },
      },
    })

    if (!invitation) {
      throw new NotFoundException({
        code: 'INVITATION_NOT_FOUND',
        message: 'Invitación no encontrada',
      })
    }

    if (invitation.status !== 'PENDING') {
      throw new BadRequestException({
        code: 'INVITATION_NOT_PENDING',
        message: 'La invitación ya no está pendiente',
      })
    }

    if (invitation.expiresAt < new Date()) {
      await this.prisma.pendingInvitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      })
      throw new BadRequestException({
        code: 'INVITATION_EXPIRED',
        message: 'La invitación ha caducado',
      })
    }

    return invitation
  }

  async acceptInvitation(code: string, userId: string) {
    const invitation = await this.prisma.pendingInvitation.findUnique({
      where: { code },
    })

    if (!invitation) {
      throw new NotFoundException({
        code: 'INVITATION_NOT_FOUND',
        message: 'Invitación no encontrada',
      })
    }

    if (invitation.status !== 'PENDING') {
      throw new BadRequestException({
        code: 'INVITATION_NOT_PENDING',
        message: 'La invitación ya no está pendiente',
      })
    }

    if (invitation.expiresAt < new Date()) {
      await this.prisma.pendingInvitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      })
      throw new BadRequestException({
        code: 'INVITATION_EXPIRED',
        message: 'La invitación ha caducado',
      })
    }

    if (invitation.userId && invitation.userId !== userId) {
      throw new ForbiddenException({
        code: 'INVITATION_NOT_FOR_YOU',
        message: 'Esta invitación no es para ti',
      })
    }

    const existingMembership = await this.prisma.teamMembership.findUnique({
      where: {
        userId_teamId: { userId, teamId: invitation.teamId },
      },
      select: { id: true, status: true },
    })

    if (existingMembership?.status === 'ACTIVE') {
      await this.prisma.pendingInvitation.update({
        where: { id: invitation.id },
        data: { status: 'USED', usedAt: new Date(), userId },
      })
      return {
        accepted: true,
        alreadyMember: true,
        message: 'Ya formabas parte de este equipo',
      }
    }

    const teamRoleId = invitation.roleId

    await this.prisma.teamMembership.upsert({
      where: {
        userId_teamId: { userId, teamId: invitation.teamId },
      },
      create: {
        userId,
        teamId: invitation.teamId,
        status: 'ACTIVE',
        invitedById: invitation.invitedById,
        roles: {
          create: [{ roleId: teamRoleId }],
        },
      },
      update: {
        status: 'ACTIVE',
        leftAt: null,
      },
    })

    await ensureClubMemberForTeam(this.prisma, userId, invitation.teamId)

    await this.prisma.pendingInvitation.update({
      where: { id: invitation.id },
      data: { status: 'USED', usedAt: new Date(), userId },
    })

    return { accepted: true, alreadyMember: false }
  }

  async rejectInvitation(code: string, userId: string) {
    const invitation = await this.prisma.pendingInvitation.findUnique({
      where: { code },
    })

    if (!invitation) {
      throw new NotFoundException({
        code: 'INVITATION_NOT_FOUND',
        message: 'Invitación no encontrada',
      })
    }

    if (invitation.status !== 'PENDING') {
      throw new BadRequestException({
        code: 'INVITATION_NOT_PENDING',
        message: 'La invitación ya no está pendiente',
      })
    }

    if (invitation.userId && invitation.userId !== userId) {
      throw new ForbiddenException({
        code: 'INVITATION_NOT_FOR_YOU',
        message: 'Esta invitación no es para ti',
      })
    }

    await this.prisma.pendingInvitation.update({
      where: { id: invitation.id },
      data: { status: 'REJECTED' },
    })

    return { rejected: true }
  }
}