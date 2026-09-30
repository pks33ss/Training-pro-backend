import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateTeamDto } from './dto/create-team.dto'
import { UpdateTeamDto } from './dto/update-team.dto'
import {
  canViewTeam,
  canEditTeam,
  canManageMembers,
  canDeleteTeam,
  canInviteToClub,
  getRemovableRoles,
  getAddableRoles,
  isActiveClubMember,
} from '../common/access'

@Injectable()
export class TeamService {
  constructor(private prisma: PrismaService) {}

  // ============================================
  // CRUD EQUIPOS
  // ============================================

  async create(userId: string, createTeamDto: CreateTeamDto) {
    if (!(await isActiveClubMember(this.prisma, userId, createTeamDto.clubId))) {
      throw new ForbiddenException('No tienes acceso a este club')
    }

    return this.prisma.team.create({
      data: {
        name: createTeamDto.name,
        sport: createTeamDto.sport || 'BASKETBALL',
        category: createTeamDto.category,
        season: createTeamDto.season,
        clubId: createTeamDto.clubId,
      },
      include: {
        club: true,
      },
    })
  }

  async findAllByClub(userId: string, clubId: string) {
    if (!(await isActiveClubMember(this.prisma, userId, clubId))) {
      throw new ForbiddenException('No tienes acceso a este club')
    }

    return this.prisma.team.findMany({
      where: { clubId },
      include: {
        memberships: {
          where: { roles: { some: { role: 'PLAYER' } }, status: 'ACTIVE' },
          select: { id: true },
        },
      },
    })
  }

  async findAllByClubWithMembers(userId: string, clubId: string) {
    if (!(await isActiveClubMember(this.prisma, userId, clubId))) {
      throw new ForbiddenException('No tienes acceso a este club')
    }

    return this.prisma.team.findMany({
      where: { clubId },
      include: {
        memberships: {
          where: { roles: { some: { role: 'PLAYER' } }, status: 'ACTIVE' },
          select: { id: true },
        },
      },
      orderBy: { name: 'asc' },
    })
  }

  async findOne(userId: string, teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        club: true,
        memberships: {
          where: { status: 'ACTIVE' },
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
            season: {
              select: { id: true, name: true, color: true },
            },
            roles: true,
          },
          orderBy: [{ jerseyNumber: 'asc' }],
        },
      },
    })

    if (!team) {
      throw new NotFoundException('Equipo no encontrado')
    }

    const teamWithRoles = {
      ...team,
      memberships: team.memberships.map((m: any) => ({
        ...m,
        role: m.roles?.[0]?.role ?? 'PLAYER',
        roles: (m.roles ?? []).map((r: any) => r.role),
      })),
    }

    const myMembership = await this.prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId, teamId } },
      include: { roles: true },
    })

    const myMembershipPayload = myMembership
      ? {
          id: myMembership.id,
          status: myMembership.status,
          roles: myMembership.roles.map((r) => r.role),
        }
      : null

    if (!(await canViewTeam(this.prisma, userId, teamId))) {
      throw new ForbiddenException('No tienes acceso a este equipo')
    }

    return { ...teamWithRoles, myMembership: myMembershipPayload }
  }

  // ============================================
  // PERMISOS DEL USER ACTUAL SOBRE ESTE EQUIPO
  // ============================================

  async getMyPermissions(userId: string, teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, clubId: true },
    })
    if (!team) throw new NotFoundException('Equipo no encontrado')

    const canView = await canViewTeam(this.prisma, userId, teamId)
    if (!canView) {
      throw new ForbiddenException('No tienes acceso a este equipo')
    }

    const [canEdit, canManage, canDelete, canInvite, removableRoles, addableRoles] =
      await Promise.all([
        canEditTeam(this.prisma, userId, teamId),
        canManageMembers(this.prisma, userId, teamId),
        canDeleteTeam(this.prisma, userId, teamId),
        canInviteToClub(this.prisma, userId, team.clubId),
        getRemovableRoles(this.prisma, userId, teamId),
        getAddableRoles(this.prisma, userId, teamId),
      ])

    return {
      teamId,
      clubId: team.clubId,
      canView,
      canEdit,
      canManage,
      canDelete,
      canInvite,
      removableRoles,
      addableRoles,
    }
  }

  // ============================================
  // UPDATE / REMOVE
  // ============================================

  async update(userId: string, teamId: string, updateTeamDto: UpdateTeamDto) {
    if (!(await canEditTeam(this.prisma, userId, teamId))) {
      throw new ForbiddenException('No tienes permisos para editar este equipo')
    }

    return this.prisma.team.update({
      where: { id: teamId },
      data: updateTeamDto,
    })
  }

  async remove(userId: string, teamId: string) {
    if (!(await canDeleteTeam(this.prisma, userId, teamId))) {
      throw new ForbiddenException('No tienes permisos para eliminar este equipo')
    }

    return this.prisma.team.delete({
      where: { id: teamId },
    })
  }
}