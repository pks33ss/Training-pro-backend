import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { generateInvitationCode } from './utils/generate-code'
import { CreateInvitationDto } from './dto'

const INVITATION_EXPIRY_DAYS = 7

@Injectable()
export class InvitationsService {
  constructor(private prisma: PrismaService) {}

  // ============================================
  // HELPERS DE PERMISOS
  // ============================================

  /**
   * Verifica que el usuario tiene permiso para invitar a un equipo.
   * Permitido para: super admin, admin del club, admin del equipo,
   * coach o assistant del equipo.
   */
  private async verifyCanInvite(userId: string, teamId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) throw new NotFoundException('Usuario no encontrado')

    // Super admin siempre puede
    if (user.role === 'SUPER_ADMIN') return

    // Buscar si es miembro del equipo con rol de gestión
    const membership = await this.prisma.teamMembership.findFirst({
      where: {
        userId,
        teamId,
        status: 'ACTIVE',
        role: { in: ['COACH', 'ASSISTANT', 'ADMIN_TEAM'] },
      },
    })

    if (membership) return

    // Buscar si es admin del club al que pertenece el equipo
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { club: true },
    })

    if (!team) throw new NotFoundException('Equipo no encontrado')

    const clubMember = await this.prisma.clubMember.findFirst({
      where: {
        userId,
        clubId: team.clubId,
        isActive: true,
        role: 'ADMIN_CLUB',
      },
    })

    if (clubMember) return

    throw new ForbiddenException(
      'No tienes permisos para invitar a este equipo',
    )
  }

  // ============================================
  // CREAR INVITACIÓN
  // ============================================

  async create(userId: string, dto: CreateInvitationDto) {
    await this.verifyCanInvite(userId, dto.teamId)

    // Si nos pasan un email y ya existe un User con ese email, vinculamos la invitación al User
    let targetUserId = dto.userId || null

    if (!targetUserId && dto.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: dto.email },
      })
      if (existingUser) targetUserId = existingUser.id
    }

    // Si no hay userId ni email, error: necesitamos uno de los dos
    if (!targetUserId && !dto.email && !dto.phone) {
      throw new BadRequestException(
        'Debes proporcionar al menos un email, teléfono o userId',
      )
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
        role: dto.role || 'PLAYER',
        channel: dto.channel || 'LINK',
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
      },
    })

    return {
      ...invitation,
      invitationLink: this.buildInvitationLink(code),
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
      },
    })

    if (!invitation) {
      throw new NotFoundException('Invitación no encontrada')
    }

    // Comprobar expiración
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

    // Crear el membership si no existe
    const existingMembership = await this.prisma.teamMembership.findFirst({
      where: { userId, teamId: invitation.teamId },
    })

    if (!existingMembership) {
      await this.prisma.teamMembership.create({
        data: {
          userId,
          teamId: invitation.teamId,
          role: invitation.role,
          status: 'ACTIVE',
          invitedById: invitation.invitedById,
        },
      })
    }

    // Marcar la invitación como usada
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
      process.env.FRONTEND_URL || 'https://joinsportapp.com'
    return `${baseUrl}/register?invitation=${code}`
  }
}