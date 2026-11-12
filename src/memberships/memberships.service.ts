import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException, // ← nuevo
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
  assertCanManageMembers,
  canAddRole,
  canRemoveRole,
  canViewTeam,
  getViewerLicenseSport,
  MembershipRoleValue,
  } from '../common/access'
import { resolveTeamRoleId } from '../permissions/resolve-role-id'
import { normalizeMembershipRolesList } from '../common/serialize'
import { PermissionsService } from '../permissions/permissions.service'
import { generateUniqueUsername } from '../user/utils/generate-username'

@Injectable()
export class MembershipsService {
  constructor(
  private prisma: PrismaService,
  private permissionsService: PermissionsService,
) {}

  // ============================================
  // MIS MEMBERSHIPS
  // ============================================

  async findMine(userId: string) {
  // ✅ NUEVO — Deporte restringido para licencia BETA
  const viewerLicenseSport = await getViewerLicenseSport(this.prisma, userId)

  return this.prisma.teamMembership.findMany({
      where: {
      userId,
      ...(viewerLicenseSport && { team: { sport: viewerLicenseSport } }),
    },
      include: {
        team: {
          include: {
            club: {
              select: {
                id: true,
                name: true,
                logo: true,
                primaryColor: true,
                secondaryColor: true,
              },
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
    // ✅ Buscamos el equipo (necesitamos su clubId)
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, clubId: true },
    })
    if (!team) {
      throw new NotFoundException('Equipo no encontrado')
    }

    // ✅ Comprobamos member:view (el servicio recibe el prisma como primer argumento)
    const canViewMembers = await this.permissionsService.can(
      this.prisma,
      userId,
      'member',
      'view',
      { clubId: team.clubId, teamId },
    )
    if (!canViewMembers) {
      throw new ForbiddenException('No tienes permiso para ver los miembros')
    }

    

    const clubMembers = await this.prisma.clubMember.findMany({
      where: {
        clubId: team.clubId,
        isActive: true,
        clubMemberRoles: {
          some: {
            OR: [
              { scope: 'ALL' },
              { scope: 'TEAMS', teamScopes: { some: { teamId } } },
            ],
          },
        },
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
            phone: true,
            bio: true,
          },
        },
        clubMemberRoles: {
          where: {
            OR: [
              { scope: 'ALL' },
              { scope: 'TEAMS', teamScopes: { some: { teamId } } },
            ],
          },
          include: {
            roleRef: { select: { id: true, name: true } },
            teamScopes: {
              include: { team: { select: { id: true, name: true } } },
            },
          },
        },
      },
    })

    // ✅ Traemos los TeamMembership de estos usuarios en este equipo (para dorsal y posición)
    const userIds = clubMembers.map((cm) => cm.userId)
    const memberships = await this.prisma.teamMembership.findMany({
      where: { userId: { in: userIds }, teamId },
      select: { userId: true, jerseyNumber: true, position: true, joinedAt: true },
    })
    const tmByUserId = new Map(memberships.map((m) => [m.userId, m]))

    return clubMembers.map((cm) => {
      const roles = cm.clubMemberRoles.map((cmr) => cmr.roleRef.name)
      const tm = tmByUserId.get(cm.userId)

      return {
        id: cm.id,                 // ID del ClubMember (lo usa el modal para el PUT)
        userId: cm.userId,
        teamId: teamId,
        clubId: team.clubId,
        status: 'ACTIVE',
        joinedAt: tm?.joinedAt ?? cm.joinedAt,
        jerseyNumber: tm?.jerseyNumber ?? null,
        position: tm?.position ?? null,
        roles: roles,
        role: roles[0] ?? null,
        user: cm.user,
        // ✅ Lote 4.H.3 — Incluimos clubMemberRoles completos para el modal
        clubMemberRoles: cm.clubMemberRoles,
        isGlobalRole: true,
      }
    })
  }

  // ============================================
  // SOLICITAR UNIRSE A UN EQUIPO (auto-solicitud)
  // ============================================

  async requestJoin(userId: string, dto: CreateMembershipDto) {
    const team = await this.prisma.team.findUnique({
      where: { id: dto.teamId },
      select: { clubId: true },
    })
    if (!team) throw new NotFoundException('Equipo no encontrado')

    const roleName = (dto.role || 'PLAYER') as MembershipRoleValue
    const roleId = await resolveTeamRoleId(this.prisma, team.clubId, roleName)

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
            create: [{ roleId }],
          },
        },
      })
    }

    const membership = await this.prisma.teamMembership.create({
      data: {
        userId,
        teamId: dto.teamId,
        roles: { create: [{ roleId }] },
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

    await assertCanManageMembers(this.prisma, userId, membership.teamId)

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

    await assertCanManageMembers(this.prisma, userId, membership.teamId)

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

  async leave(userId: string, membershipId: string) {
    const membership = await this.prisma.teamMembership.findUnique({
      where: { id: membershipId },
      include: {
        team: { include: { club: true } },
        user: true,
        roles: { include: { roleRef: { select: { name: true } } } },
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

    const targetRoles = membership.roles.map((r) => r.roleRef.name)

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

  async addRole(
    actorId: string,
    membershipId: string,
    role: MembershipRoleValue,
  ) {
    const membership = await this.prisma.teamMembership.findUnique({
      where: { id: membershipId },
      include: {
        roles: { include: { roleRef: { select: { name: true } } } },
        team: { select: { id: true, clubId: true } },
        user: true,
      },
    })
    if (!membership) throw new NotFoundException('Membership no encontrado')

    if (membership.status !== 'ACTIVE') {
      throw new BadRequestException('La membership no está activa')
    }

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

    if (membership.roles.some((r) => r.roleRef.name === role)) {
      throw new BadRequestException('Este miembro ya tiene ese rol')
    }

    const roleId = await resolveTeamRoleId(
      this.prisma,
      membership.team.clubId,
      role,
    )

    return this.prisma.teamMembership.update({
      where: { id: membershipId },
      data: {
        roles: { create: [{ roleId }] },
      },
      include: {
        user: {
          select: { id: true, name: true, lastName: true, username: true, isGhost: true },
        },
        roles: { include: { roleRef: { select: { name: true } } } },
      },
    })
  }

  async removeRole(
    actorId: string,
    membershipId: string,
    role: MembershipRoleValue,
  ) {
    const membership = await this.prisma.teamMembership.findUnique({
      where: { id: membershipId },
      include: {
        roles: { include: { roleRef: { select: { name: true } } } },
        team: { include: { club: true } },
        user: true,
      },
    })
    if (!membership) throw new NotFoundException('Membership no encontrado')

    if (membership.status !== 'ACTIVE') {
      throw new BadRequestException('La membership no está activa')
    }

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

    if (!membership.roles.some((r) => r.roleRef.name === role)) {
      throw new BadRequestException('Este miembro no tiene ese rol')
    }

    const roleRow = membership.roles.find((r) => r.roleRef.name === role)!

    const remainingRoles = membership.roles.filter((r) => r.roleRef.name !== role)

    if (remainingRoles.length === 0) {
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
          roles: { include: { roleRef: { select: { name: true } } } },
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

    const updated = await this.prisma.teamMembership.update({
      where: { id: membershipId },
      data: {
        roles: { delete: { id: roleRow.id } },
      },
      include: {
        user: {
          select: { id: true, name: true, lastName: true, username: true, isGhost: true },
        },
        roles: { include: { roleRef: { select: { name: true } } } },
      },
    })

    if (role === 'COACH') {
      await this.notifyIfNoCoachesLeft(membership.teamId)
    }

    return updated
  }


// ============================================
  // ACTUALIZAR MEMBERSHIP
  // ============================================

  async update(
    userId: string,
    membershipId: string,
    dto: UpdateMembershipDto & { roles?: MembershipRoleValue[] },
  ) {
    const membership = await this.prisma.teamMembership.findUnique({
      where: { id: membershipId },
      include: {
        roles: { include: { roleRef: { select: { name: true } } } },
        team: { select: { id: true, clubId: true } },
      },
    })
    if (!membership) throw new NotFoundException('Membership no encontrado')

    await assertCanManageMembers(this.prisma, userId, membership.teamId)

    const { role, roles, ...rest } = dto as any

    const nextRoles: MembershipRoleValue[] | undefined =
      roles ?? (role ? [role] : undefined)

    if (nextRoles && nextRoles.length === 0) {
      throw new BadRequestException(
        'Debe haber al menos un rol. Para quitar todos los roles usa la opción de desvincular.',
      )
    }

    let createRoles: { roleId: string }[] | undefined
    if (nextRoles) {
      createRoles = []
      for (const r of nextRoles) {
        const roleId = await resolveTeamRoleId(
          this.prisma,
          membership.team.clubId,
          r,
        )
        createRoles.push({ roleId })
      }
    }

    return this.prisma.teamMembership.update({
      where: { id: membershipId },
      data: {
        ...rest,
        ...(createRoles && {
          roles: {
            deleteMany: {},
            create: createRoles,
          },
        }),
      },
      include: {
        user: {
          select: { id: true, name: true, lastName: true, username: true, isGhost: true },
        },
        roles: { include: { roleRef: { select: { name: true } } } },
      },
    })
  }
  // ============================================
  // AÑADIR MIEMBRO AL EQUIPO (existente o ghost)
  // ============================================

  async addMember(
    requesterId: string,
    teamId: string,
    dto: {
      userId?: string
      name?: string
      lastName?: string
      email?: string
      phone?: string
      role?: string
      jerseyNumber?: number
      position?: string
    },
  ) {
    // ✅ Guía 9.1: Añadir miembro = member:edit
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { clubId: true },
    })
    if (!team) throw new NotFoundException('Equipo no encontrado')

    const canEditMembers = await this.permissionsService.can(
      this.prisma,
      requesterId,
      'member',
      'edit',
      { clubId: team.clubId, teamId },
    )
    if (!canEditMembers) {
      throw new ForbiddenException(
        'No tienes permisos para añadir miembros a este equipo',
      )
    }

    // ─────────────────────────────────────────
    // Resolver targetUserId: existente o ghost
    // ─────────────────────────────────────────
    let targetUserId: string

    if (dto.userId) {
      const existingUser = await this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: { id: true, deletedAt: true },
      })
      if (!existingUser || existingUser.deletedAt) {
        throw new NotFoundException('Usuario no encontrado')
      }
      targetUserId = existingUser.id
    } else {
      if (!dto.name || !dto.lastName) {
        throw new BadRequestException(
          'Debes indicar userId o (name + lastName) para crear un miembro nuevo',
        )
      }

      // Pre-chequeo de email/phone duplicados
      if (dto.email) {
        const emailTaken = await this.prisma.user.findUnique({
          where: { email: dto.email },
          select: { id: true, deletedAt: true },
        })
        if (emailTaken && !emailTaken.deletedAt) {
          throw new ConflictException({
            code: 'USER_ALREADY_EXISTS_USE_EMAIL_INVITE',
            message:
              'Ya existe un usuario con ese email. Usa la opción "invitar" en lugar de "crear".',
          })
        }
      }

      if (dto.phone) {
        const phoneTaken = await this.prisma.user.findFirst({
          where: { phone: dto.phone },
          select: { id: true, deletedAt: true },
        })
        if (phoneTaken && !phoneTaken.deletedAt) {
          throw new ConflictException({
            code: 'USER_ALREADY_EXISTS_USE_PHONE_INVITE',
            message:
              'Ya existe un usuario con ese teléfono. Usa la opción "invitar" en lugar de "crear".',
          })
        }
      }

      const username = await generateUniqueUsername(
        this.prisma,
        dto.name,
        dto.lastName,
      )

      let ghost: { id: string }
      try {
        ghost = await this.prisma.user.create({
          data: {
            email: dto.email || null,
            name: dto.name,
            lastName: dto.lastName,
            phone: dto.phone || null,
            isGhost: true,
            username,
          },
          select: { id: true },
        })
      } catch (err: any) {
        if (err?.code === 'P2002') {
          const target = (err.meta?.target as string[] | undefined) ?? []
          if (target.includes('email')) {
            throw new ConflictException({
              code: 'USER_ALREADY_EXISTS_USE_EMAIL_INVITE',
              message:
                'Ya existe un usuario con ese email. Usa la opción "invitar" en lugar de "crear".',
            })
          }
          throw new ConflictException({
            code: 'USER_ALREADY_EXISTS',
            message: 'Ya existe un usuario con esos datos.',
          })
        }
        throw err
      }

      targetUserId = ghost.id
    }

    // ─────────────────────────────────────────
    // Resolver rol (por defecto PLAYER)
    // ─────────────────────────────────────────
    const roleName = dto.role || 'PLAYER'
    const roleId = await resolveTeamRoleId(this.prisma, team.clubId, roleName)

    // ─────────────────────────────────────────
    // Upsert de TeamMembership
    // ─────────────────────────────────────────
    const existing = await this.prisma.teamMembership.findFirst({
      where: { userId: targetUserId, teamId },
    })

    if (existing) {
      if (existing.status === 'ACTIVE') {
        throw new BadRequestException('Este usuario ya es miembro del equipo')
      }
      if (existing.status === 'PENDING') {
        throw new BadRequestException('Ya tiene una solicitud pendiente')
      }

      const membership = await this.prisma.teamMembership.update({
        where: { id: existing.id },
        data: {
          status: 'ACTIVE',
          roles: {
            deleteMany: {},
            create: [{ roleId }],
          },
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
          roles: { include: { roleRef: { select: { name: true } } } },
        },
      })

      await ensureClubMemberForTeam(this.prisma, targetUserId, teamId)

      return membership
    }

    const membership = await this.prisma.teamMembership.create({
      data: {
        userId: targetUserId,
        teamId,
        roles: { create: [{ roleId }] },
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
        roles: { include: { roleRef: { select: { name: true } } } },
      },
    })

    await ensureClubMemberForTeam(this.prisma, targetUserId, teamId)

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
      include: { roleRef: { select: { name: true } } },
    })

    if (!clubMember) return
    if (clubMember.roleRef.name === 'ADMIN_CLUB') return

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

  private async notifyIfNoCoachesLeft(teamId: string): Promise<void> {
    const coachCount = await this.prisma.teamMembership.count({
      where: {
        teamId,
        status: 'ACTIVE',
        roles: { some: { roleRef: { name: 'COACH' } } },
      },
    })

    if (coachCount > 0) return

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true, clubId: true },
    })
    if (!team) return

    const adminTeams = await this.prisma.teamMembership.findMany({
      where: {
        teamId,
        status: 'ACTIVE',
        roles: { some: { roleRef: { name: 'ADMIN_TEAM' } } },
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

    const clubAdmins = await this.prisma.clubMember.findMany({
      where: { clubId: team.clubId, isActive: true, roleRef: { name: 'ADMIN_CLUB' } },
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