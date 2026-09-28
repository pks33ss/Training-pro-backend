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
import { ensureClubMemberForTeam } from '../club/utils/ensure-club-member'
import {
  assertCanRemoveMember,
  canAddRole,
  canRemoveRole,
  getAddableRoles,
  getRemovableRoles,
  MembershipRoleValue,
} from '../common/access'

@Injectable()
export class MembershipsService {
  constructor(private prisma: PrismaService) {}

  // ============================================
  // HELPERS DE PERMISOS
  // ============================================

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
        roles: { some: { role: { in: ['COACH', 'ASSISTANT', 'ADMIN_TEAM'] } } },
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

    const memberships = await this.prisma.teamMembership.findMany({
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
            isGhost: true,
          },
        },
        season: true,
        roles: true,
      },
      orderBy: [
        { status: 'asc' },
        { jerseyNumber: 'asc' },
      ],
    })

    return memberships.map((m) => ({
      ...m,
      role: m.roles[0]?.role ?? 'PLAYER',
      roles: m.roles.map((r) => r.role),
    }))
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
      return this.prisma.teamMembership.update({
        where: { id: existing.id },
        data: {
          status: 'PENDING',
          roles: {
            deleteMany: {},
            create: [{ role: (dto.role || 'PLAYER') as any }],
          },
        },
      })
    }

    const membership = await this.prisma.teamMembership.create({
      data: {
        userId,
        teamId: dto.teamId,
        roles: { create: [{ role: (dto.role || 'PLAYER') as any }] },
        status: 'PENDING',
      },
      include: {
        team: { include: { club: true } },
      },
    })

    await ensureClubMemberForTeam(this.prisma, userId, dto.teamId)

    return membership
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
          select: { id: true, name: true, lastName: true, username: true, isGhost: true },
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

    return this.prisma.teamMembership.delete({
      where: { id: membershipId },
    })
  }

  // ============================================
  // SALIR / QUITAR DEL EQUIPO
  // ============================================

  /**
   * Saca a un miembro del equipo (status LEFT).
   *
   * Regla relajada: se permite aunque sea el último COACH.
   * Se notifica a ADMIN_TEAM del equipo (y si no hay, a ADMIN_CLUB).
   */
  async leave(userId: string, membershipId: string) {
    const membership = await this.prisma.teamMembership.findUnique({
      where: { id: membershipId },
      include: {
        team: { include: { club: true } },
        user: true,
        roles: true,
      },
    })
    if (!membership) throw new NotFoundException('Membership no encontrado')

    if (membership.status === 'LEFT') {
      throw new BadRequestException('Este miembro ya ha salido del equipo')
    }

    await assertCanRemoveMember(
      this.prisma,
      userId,
      membership.userId,
      membership.teamId,
    )

    const targetRoles = membership.roles.map((r) => r.role)

    // Notificar a club admin si el que sale era staff
    const memberName = membership.user
      ? `${membership.user.name ?? ''} ${membership.user.lastName ?? ''}`.trim() ||
        'Usuario desconocido'
      : 'Usuario desconocido'

    const staffRole = targetRoles.find((r) =>
      ['COACH', 'ASSISTANT', 'ADMIN_TEAM'].includes(r),
    )

    if (staffRole) {
      try {
        await notifyClubAdminOfDeparture(this.prisma, {
          clubId: membership.team.clubId,
          teamName: membership.team.name,
          memberName,
          memberRole: staffRole,
          departedAt: new Date(),
        })
      } catch (err) {
        console.error('⚠️ Error notificando salida (no crítico):', err)
      }
    }

    const updated = await this.prisma.teamMembership.update({
      where: { id: membershipId },
      data: {
        status: 'LEFT',
        leftAt: new Date(),
      },
    })

    // Si era COACH y ya no quedan COACH en el equipo, notificar
    if (targetRoles.includes('COACH')) {
      await this.notifyIfNoCoachesLeft(membership.teamId)
    }

    await this.syncClubMembershipAfterLeave(
      membership.userId,
      membership.team.clubId,
    )

    return updated
  }

  // ============================================
  // AÑADIR / QUITAR ROLES INDIVIDUALES
  // ============================================

  /**
   * Añade un rol a una membership existente.
   * No hace nada si ya lo tenía.
   */
  async addRole(
    actorId: string,
    membershipId: string,
    role: MembershipRoleValue,
  ) {
    const membership = await this.prisma.teamMembership.findUnique({
      where: { id: membershipId },
      include: { roles: true, team: true, user: true },
    })
    if (!membership) throw new NotFoundException('Membership no encontrado')

    if (membership.status !== 'ACTIVE') {
      throw new BadRequestException('La membership no está activa')
    }

    // Permiso
    if (
      !(await canAddRole(
        this.prisma,
        actorId,
        membership.userId,
        membership.teamId,
        role,
      ))
    ) {
      throw new ForbiddenException('No tienes permisos para añadir este rol')
    }

    // ¿Ya lo tiene?
    if (membership.roles.some((r) => r.role === role)) {
      throw new BadRequestException('Este miembro ya tiene ese rol')
    }

    return this.prisma.teamMembership.update({
      where: { id: membershipId },
      data: {
        roles: { create: [{ role }] },
      },
      include: {
        user: {
          select: { id: true, name: true, lastName: true, username: true, isGhost: true },
        },
        roles: true,
      },
    })
  }

  /**
   * Quita un rol de una membership.
   * Si al quitarlo la membership se queda sin roles → status LEFT.
   * Si el rol era COACH y ya no quedan COACH → notificar.
   */
  async removeRole(
    actorId: string,
    membershipId: string,
    role: MembershipRoleValue,
  ) {
    const membership = await this.prisma.teamMembership.findUnique({
      where: { id: membershipId },
      include: { roles: true, team: { include: { club: true } }, user: true },
    })
    if (!membership) throw new NotFoundException('Membership no encontrado')

    if (membership.status !== 'ACTIVE') {
      throw new BadRequestException('La membership no está activa')
    }

    // Permiso
    if (
      !(await canRemoveRole(
        this.prisma,
        actorId,
        membership.userId,
        membership.teamId,
        role,
      ))
    ) {
      throw new ForbiddenException('No tienes permisos para quitar este rol')
    }

    // ¿Lo tiene?
    if (!membership.roles.some((r) => r.role === role)) {
      throw new BadRequestException('Este miembro no tiene ese rol')
    }

    // ¿Era el último rol?
    const remainingRoles = membership.roles.filter((r) => r.role !== role)

    if (remainingRoles.length === 0) {
      // Dejar la membership en LEFT (equivale a leave)
      const updated = await this.prisma.teamMembership.update({
        where: { id: membershipId },
        data: {
          status: 'LEFT',
          leftAt: new Date(),
          roles: { deleteMany: {} },
        },
        include: {
          user: {
            select: { id: true, name: true, lastName: true, username: true, isGhost: true },
          },
          roles: true,
        },
      })

      if (role === 'COACH') {
        await this.notifyIfNoCoachesLeft(membership.teamId)
      }

      await this.syncClubMembershipAfterLeave(
        membership.userId,
        membership.team.clubId,
      )

      return updated
    }

    // Todavía tiene otros roles: solo quitar este
    const updated = await this.prisma.teamMembership.update({
      where: { id: membershipId },
      data: {
        roles: { delete: { membershipId_role: { membershipId, role } } },
      },
      include: {
        user: {
          select: { id: true, name: true, lastName: true, username: true, isGhost: true },
        },
        roles: true,
      },
    })

    if (role === 'COACH') {
      await this.notifyIfNoCoachesLeft(membership.teamId)
    }

    return updated
  }

  // ============================================
  // ACTUALIZAR MEMBERSHIP (roles, dorsal, posición)
  // ============================================

  async update(userId: string, membershipId: string, dto: UpdateMembershipDto & { roles?: MembershipRoleValue[] }) {
    const membership = await this.prisma.teamMembership.findUnique({
      where: { id: membershipId },
      include: { roles: true },
    })
    if (!membership) throw new NotFoundException('Membership no encontrado')

    await this.verifyCanManageTeam(userId, membership.teamId)

    // Compat: si viene `role` (singular), se convierte en `roles: [role]`
    const { role, roles, ...rest } = dto as any

    const nextRoles: MembershipRoleValue[] | undefined = roles ?? (role ? [role] : undefined)

    if (nextRoles && nextRoles.length === 0) {
      throw new BadRequestException('Debe haber al menos un rol. Para quitar todos los roles usa la opción de desvincular.')
    }

    return this.prisma.teamMembership.update({
      where: { id: membershipId },
      data: {
        ...rest,
        ...(nextRoles && {
          roles: {
            deleteMany: {},
            create: nextRoles.map((r) => ({ role: r })),
          },
        }),
      },
      include: {
        user: {
          select: { id: true, name: true, lastName: true, username: true, isGhost: true },
        },
        roles: true,
      },
    })
  }

  // ============================================
  // AÑADIR MIEMBRO EXISTENTE AL EQUIPO (directo)
  // ============================================

  async addMember(
    requesterId: string,
    teamId: string,
    dto: { userId: string; role?: string; jerseyNumber?: number; position?: string },
  ) {
    await this.verifyCanManageTeam(requesterId, teamId)

    const targetUser = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    })
    if (!targetUser) {
      throw new NotFoundException('Usuario no encontrado')
    }

    const existing = await this.prisma.teamMembership.findFirst({
      where: { userId: dto.userId, teamId },
    })

    if (existing) {
      if (existing.status === 'ACTIVE') {
        throw new BadRequestException('Este usuario ya es miembro del equipo')
      }
      if (existing.status === 'PENDING') {
        throw new BadRequestException('Ya tiene una solicitud pendiente')
      }

      const newRole = dto.role || null

      const membership = await this.prisma.teamMembership.update({
        where: { id: existing.id },
        data: {
          status: 'ACTIVE',
          ...(newRole && {
            roles: {
              deleteMany: {},
              create: [{ role: newRole as any }],
            },
          }),
          jerseyNumber: dto.jerseyNumber ?? existing.jerseyNumber,
          position: dto.position ?? existing.position,
          joinedAt: new Date(),
          leftAt: null,
          invitedById: requesterId,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              lastName: true,
              username: true,
              avatar: true,
              email: true,
              isGhost: true,
            },
          },
          season: true,
          roles: true,
        },
      })

      await ensureClubMemberForTeam(this.prisma, dto.userId, teamId)

      return membership
    }

    const membership = await this.prisma.teamMembership.create({
      data: {
        userId: dto.userId,
        teamId,
        roles: { create: [{ role: (dto.role || 'PLAYER') as any }] },
        status: 'ACTIVE',
        jerseyNumber: dto.jerseyNumber ?? null,
        position: dto.position ?? null,
        invitedById: requesterId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            lastName: true,
            username: true,
            avatar: true,
            email: true,
            isGhost: true,
          },
        },
        season: true,
        roles: true,
      },
    })

    await ensureClubMemberForTeam(this.prisma, dto.userId, teamId)

    return membership
  }

  // ============================================
  // HELPERS PRIVADOS
  // ============================================

  private async syncClubMembershipAfterLeave(
    userId: string,
    clubId: string,
  ): Promise<void> {
    const clubMember = await this.prisma.clubMember.findFirst({
      where: { userId, clubId },
    })

    if (!clubMember) return
    if (clubMember.role === 'ADMIN_CLUB') return

    const activeCount = await this.prisma.teamMembership.count({
      where: {
        userId,
        status: 'ACTIVE',
        team: { clubId },
      },
    })

    if (activeCount === 0 && clubMember.isActive) {
      await this.prisma.clubMember.update({
        where: { id: clubMember.id },
        data: { isActive: false },
      })
    }
  }

  /**
   * Si ya no quedan COACH activos en el equipo, notifica a los ADMIN_TEAM.
   * Si no hay ADMIN_TEAM, notifica a los ADMIN_CLUB del club.
   * Solo console.log por ahora.
   */
  private async notifyIfNoCoachesLeft(teamId: string): Promise<void> {
    const coachCount = await this.prisma.teamMembership.count({
      where: {
        teamId,
        status: 'ACTIVE',
        roles: { some: { role: 'COACH' } },
      },
    })

    if (coachCount > 0) return

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true, clubId: true },
    })
    if (!team) return

    // 1) ADMIN_TEAM del equipo
    const adminTeams = await this.prisma.teamMembership.findMany({
      where: {
        teamId,
        status: 'ACTIVE',
        roles: { some: { role: 'ADMIN_TEAM' } },
      },
      include: {
        user: { select: { id: true, email: true, name: true, lastName: true } },
      },
    })

    if (adminTeams.length > 0) {
      for (const at of adminTeams) {
        console.log(
          `📧 [PENDIENTE SMTP] Aviso a ${at.user.email ?? at.user.id} (ADMIN_TEAM): ` +
            `el equipo "${team.name}" se ha quedado SIN ENTRENADOR. ` +
            `Fecha: ${new Date().toLocaleDateString('es-ES')}`,
        )
      }
      return
    }

    // 2) Fallback: ADMIN_CLUB del club
    const clubAdmins = await this.prisma.clubMember.findMany({
      where: { clubId: team.clubId, role: 'ADMIN_CLUB', isActive: true },
      include: {
        user: { select: { id: true, email: true, name: true, lastName: true } },
      },
    })

    for (const ca of clubAdmins) {
      console.log(
        `📧 [PENDIENTE SMTP] Aviso a ${ca.user.email ?? ca.user.id} (ADMIN_CLUB): ` +
          `el equipo "${team.name}" se ha quedado SIN ENTRENADOR. ` +
          `Fecha: ${new Date().toLocaleDateString('es-ES')}`,
      )
    }
  }
}