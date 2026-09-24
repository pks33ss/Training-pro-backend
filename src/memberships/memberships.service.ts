import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
  CreateMembershipDto,
  UpdateMembershipDto,
  MembershipRole,
} from './dto'
import { notifyClubAdminOfDeparture } from './utils/notify-club-admin'

@Injectable()
export class MembershipsService {
  constructor(private prisma: PrismaService) {}

  // ============================================
  // HELPERS DE PERMISOS
  // ============================================

  /**
   * Verifica que el usuario es admin/coach/assistant del equipo o admin del club.
   */
  private async verifyCanManageTeam(userId: string, teamId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    })
    if (!user) throw new NotFoundException('Usuario no encontrado')
    if (user.role === 'SUPER_ADMIN') return

    const membership = await this.prisma.teamMembership.findFirst({
      where: {
        userId,
        teamId,
        status: 'ACTIVE',
        role: { in: ['COACH', 'ASSISTANT', 'ADMIN_TEAM'] },
      },
    })
    if (membership) return

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    })
    if (!team) throw new NotFoundException('Equipo no encontrado')

    const clubAdmin = await this.prisma.clubMember.findFirst({
      where: {
        userId,
        clubId: team.clubId,
        isActive: true,
        role: 'ADMIN_CLUB',
      },
    })
    if (clubAdmin) return

    throw new ForbiddenException(
      'No tienes permisos para gestionar este equipo',
    )
  }

  // ============================================
  // MIS MEMBERSHIPS
  // ============================================

  async findMine(userId: string) {
    return this.prisma.teamMembership.findMany({
      where: { userId },
      include: {
        team: {
          include: {
            club: {
              select: { id: true, name: true, logo: true },
            },
          },
        },
        season: true,
      },
      orderBy: [{ status: 'asc' }, { joinedAt: 'desc' }],
    })
  }

  // ============================================
  // MIEMBROS DE UN EQUIPO
  // ============================================

  async findByTeam(userId: string, teamId: string) {
    // Permitir ver miembros a cualquiera que sea miembro del club o super admin
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('Usuario no encontrado')

    if (user.role !== 'SUPER_ADMIN') {
      const team = await this.prisma.team.findUnique({
        where: { id: teamId },
      })
      if (!team) throw new NotFoundException('Equipo no encontrado')

      const clubMember = await this.prisma.clubMember.findFirst({
        where: { userId, clubId: team.clubId, isActive: true },
      })
      if (!clubMember) {
        throw new ForbiddenException('No tienes acceso a este equipo')
      }
    }

    return this.prisma.teamMembership.findMany({
      where: { teamId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            lastName: true,
            username: true,
            avatar: true,
            email: true,
          },
        },
        season: true,
      },
      orderBy: [
        { status: 'asc' },
        { role: 'asc' },
        { jerseyNumber: 'asc' },
      ],
    })
  }

  // ============================================
  // SOLICITAR UNIRSE A UN EQUIPO (auto-solicitud)
  // ============================================

  async requestJoin(userId: string, dto: CreateMembershipDto) {
    const team = await this.prisma.team.findUnique({
      where: { id: dto.teamId },
    })
    if (!team) throw new NotFoundException('Equipo no encontrado')

    const existing = await this.prisma.teamMembership.findFirst({
      where: { userId, teamId: dto.teamId },
    })

    if (existing) {
      if (existing.status === 'ACTIVE') {
        throw new BadRequestException('Ya eres miembro de este equipo')
      }
      if (existing.status === 'PENDING') {
        throw new BadRequestException('Ya tienes una solicitud pendiente')
      }
      // Si está LEFT o INACTIVE, se puede volver a solicitar
      return this.prisma.teamMembership.update({
        where: { id: existing.id },
        data: {
          status: 'PENDING',
          role: dto.role || 'PLAYER',
        },
      })
    }

    return this.prisma.teamMembership.create({
      data: {
        userId,
        teamId: dto.teamId,
        role: dto.role || 'PLAYER',
        status: 'PENDING',
      },
      include: {
        team: { include: { club: true } },
      },
    })
  }

  // ============================================
  // ACEPTAR SOLICITUD
  // ============================================

  async accept(userId: string, membershipId: string) {
    const membership = await this.prisma.teamMembership.findUnique({
      where: { id: membershipId },
    })
    if (!membership) throw new NotFoundException('Solicitud no encontrada')

    await this.verifyCanManageTeam(userId, membership.teamId)

    if (membership.status !== 'PENDING') {
      throw new BadRequestException('La solicitud no está pendiente')
    }

    return this.prisma.teamMembership.update({
      where: { id: membershipId },
      data: { status: 'ACTIVE', joinedAt: new Date() },
      include: {
        user: {
          select: { id: true, name: true, lastName: true, username: true },
        },
      },
    })
  }

  // ============================================
  // RECHAZAR SOLICITUD
  // ============================================

  async reject(userId: string, membershipId: string) {
    const membership = await this.prisma.teamMembership.findUnique({
      where: { id: membershipId },
    })
    if (!membership) throw new NotFoundException('Solicitud no encontrada')

    await this.verifyCanManageTeam(userId, membership.teamId)

    if (membership.status !== 'PENDING') {
      throw new BadRequestException('La solicitud no está pendiente')
    }

    // La eliminamos (no tiene sentido guardar rechazos)
    return this.prisma.teamMembership.delete({
      where: { id: membershipId },
    })
  }

    // ============================================
  // SALIR / QUITAR DEL EQUIPO
  // ============================================

  async leave(userId: string, membershipId: string) {
    const membership = await this.prisma.teamMembership.findUnique({
      where: { id: membershipId },
      include: {
        team: { include: { club: true } },
        user: true,
      },
    })
    if (!membership) throw new NotFoundException('Membership no encontrado')

    if (membership.status === 'LEFT') {
      throw new BadRequestException('Este miembro ya ha salido del equipo')
    }

    // ============================================
    // DETERMINAR PERMISOS
    // ============================================

    const isSelf = membership.userId === userId

    let isManager = false

    if (!isSelf) {
      // ¿Es coach/assistant/admin del equipo?
      const myMembership = await this.prisma.teamMembership.findFirst({
        where: {
          userId,
          teamId: membership.teamId,
          status: 'ACTIVE',
          role: { in: ['COACH', 'ASSISTANT', 'ADMIN_TEAM'] },
        },
      })

      if (myMembership) {
        isManager = true
      } else {
        // ¿Es admin del club?
        const clubAdmin = await this.prisma.clubMember.findFirst({
          where: {
            userId,
            clubId: membership.team.clubId,
            isActive: true,
            role: 'ADMIN_CLUB',
          },
        })
        if (clubAdmin) isManager = true
      }

      // ¿Es super admin?
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      })
      if (user?.role === 'SUPER_ADMIN') isManager = true
    }

    if (!isSelf && !isManager) {
      throw new ForbiddenException(
        'No tienes permisos para quitar a este miembro del equipo',
      )
    }

    // ============================================
    // REGLAS ESPECIALES
    // ============================================

    // Si es el último COACH activo del equipo, no se puede quitar (ni por sí mismo)
    if (membership.role === 'COACH' && membership.status === 'ACTIVE') {
      const coachCount = await this.prisma.teamMembership.count({
        where: {
          teamId: membership.teamId,
          role: 'COACH',
          status: 'ACTIVE',
        },
      })

      if (coachCount <= 1) {
        throw new BadRequestException(
          'No puedes quitar al último entrenador del equipo. Promueve a otro miembro primero.',
        )
      }
    }

    // ============================================
    // NOTIFICAR (solo si es coach/assistant)
    // ============================================

    if (
      membership.role === 'COACH' ||
      membership.role === 'ASSISTANT' ||
      membership.role === 'ADMIN_TEAM'
    ) {
      await notifyClubAdminOfDeparture(this.prisma, {
        clubId: membership.team.clubId,
        teamName: membership.team.name,
        memberName: `${membership.user.name} ${membership.user.lastName}`,
        memberRole: membership.role,
        departedAt: new Date(),
      })
    }

    // ============================================
    // SOFT DELETE
    // ============================================

    return this.prisma.teamMembership.update({
      where: { id: membershipId },
      data: {
        status: 'LEFT',
        leftAt: new Date(),
      },
    })
  }

  // ============================================
  // ACTUALIZAR MEMBERSHIP (rol, dorsal, posición)
  // ============================================

  async update(userId: string, membershipId: string, dto: UpdateMembershipDto) {
    const membership = await this.prisma.teamMembership.findUnique({
      where: { id: membershipId },
    })
    if (!membership) throw new NotFoundException('Membership no encontrado')

    await this.verifyCanManageTeam(userId, membership.teamId)

    return this.prisma.teamMembership.update({
      where: { id: membershipId },
      data: dto,
      include: {
        user: {
          select: { id: true, name: true, lastName: true, username: true },
        },
      },
    })
  }
}