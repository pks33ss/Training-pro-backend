import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateTeamDto } from './dto/create-team.dto'
import { UpdateTeamDto } from './dto/update-team.dto'
import { MailService } from '../mail/mail.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
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
import { resolveTeamRoleId } from '../permissions/resolve-role-id'
import { normalizeMembershipRolesList } from '../common/serialize'

@Injectable()
export class TeamService {

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private cloudinaryService: CloudinaryService,
  ) {}

  // ============================================
  // CRUD EQUIPOS
  // ============================================

  async create(userId: string, createTeamDto: CreateTeamDto) {
    if (!(await isActiveClubMember(this.prisma, userId, createTeamDto.clubId))) {
      throw new ForbiddenException('No tienes acceso a este club');
    }

    const adminTeamRoleId = await resolveTeamRoleId(
      this.prisma,
      createTeamDto.clubId,
      'ADMIN_TEAM',
    );

    const team = await this.prisma.$transaction(async (tx) => {
      const newTeam = await tx.team.create({
        data: {
          name: createTeamDto.name,
          sport: createTeamDto.sport || 'BASKETBALL',
          category: createTeamDto.category,
          season: createTeamDto.season,
          clubId: createTeamDto.clubId,
          primaryColor: createTeamDto.primaryColor,
          secondaryColor: createTeamDto.secondaryColor,
          logo: createTeamDto.logo,
        },
        include: {
          club: true,
        },
      });

      await tx.teamMembership.create({
        data: {
          userId,
          teamId: newTeam.id,
          status: 'ACTIVE',
          roles: {
            create: [{ roleId: adminTeamRoleId }],
          },
        },
      });

      return newTeam;
    });

    const creator = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, lastName: true, email: true },
    });

    this.mailService
      .sendAdminNotification({
        eventTitle: 'Nuevo equipo creado',
        icon: '🏆',
        fields: [
          { label: 'Equipo', value: team.name },
          { label: 'Deporte', value: team.sport },
          ...(team.category ? [{ label: 'Categoría', value: team.category }] : []),
          ...(team.season ? [{ label: 'Temporada', value: team.season }] : []),
          { label: 'Club', value: team.club?.name ?? '(sin club)' },
          {
            label: 'Creador',
            value: creator
              ? `${creator.name} ${creator.lastName}`
              : '(desconocido)',
          },
          { label: 'ID', value: team.id },
        ],
      })
      .catch((err) => console.error('Error notificando creación de equipo:', err));

    return team;
  }

  async findAllByClub(userId: string, clubId: string) {
    if (!(await isActiveClubMember(this.prisma, userId, clubId))) {
      throw new ForbiddenException('No tienes acceso a este club')
    }

    return this.prisma.team.findMany({
      where: { clubId },
      include: {
        memberships: {
          where: {
            roles: { some: { roleRef: { name: 'PLAYER' } } },
            status: 'ACTIVE',
          },
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
          where: {
            roles: { some: { roleRef: { name: 'PLAYER' } } },
            status: 'ACTIVE',
          },
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
            roles: { include: { roleRef: { select: { name: true } } } },
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
      memberships: normalizeMembershipRolesList(team.memberships),
    }

    const myMembership = await this.prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId, teamId } },
      include: { roles: { include: { roleRef: { select: { name: true } } } } },
    })

    const myMembershipPayload = myMembership
      ? {
          id: myMembership.id,
          status: myMembership.status,
          roles: myMembership.roles.map((r) => r.roleRef.name),
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

  // ============================================
  // LOGO DEL EQUIPO
  // ============================================

  async uploadLogo(userId: string, teamId: string, base64Image: string) {
    if (!(await canEditTeam(this.prisma, userId, teamId))) {
      throw new ForbiddenException('No tienes permisos para editar este equipo')
    }

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    })

    if (!team) {
      throw new NotFoundException('Equipo no encontrado')
    }

    const { url } = await this.cloudinaryService.uploadImage(
      base64Image,
      `training-pro/teams/${teamId}`,
    )

    return this.prisma.team.update({
      where: { id: teamId },
      data: { logo: url },
    })
  }

  async removeLogo(userId: string, teamId: string) {
    if (!(await canEditTeam(this.prisma, userId, teamId))) {
      throw new ForbiddenException('No tienes permisos para editar este equipo')
    }

    return this.prisma.team.update({
      where: { id: teamId },
      data: { logo: null },
    })
  }

  async getOpponentPlayers(
    userId: string,
    teamId: string,
    query: {
      season?: string
      from?: string
      to?: string
      matchIds?: string
    } = {},
  ) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true },
    })
    if (!team) throw new NotFoundException('Equipo no encontrado')
    if (!(await canViewTeam(this.prisma, userId, teamId))) {
      throw new ForbiddenException('No tienes acceso a este equipo')
    }

    // Construir filtro de partidos (solo FINISHED)
    const matchWhere: any = {
      teamId,
      status: 'FINISHED',
    }
    if (query.season) matchWhere.season = query.season
    if (query.from || query.to) {
      matchWhere.date = {}
      if (query.from) matchWhere.date.gte = new Date(query.from)
      if (query.to) {
        const t = new Date(query.to)
        t.setUTCHours(23, 59, 59, 999)
        matchWhere.date.lte = t
      }
    }
    if (query.matchIds) {
      const ids = query.matchIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (ids.length > 0) matchWhere.id = { in: ids }
    }

    // 1. Partidos filtrados (para PJ y para sumar opponentScore)
    const matches = await this.prisma.match.findMany({
      where: matchWhere,
      select: {
        id: true,
        opponentScore: true,
      },
    })

    const matchesCount = matches.length
    const totalOpponentScore = matches.reduce(
      (acc, m) => acc + (m.opponentScore ?? 0),
      0,
    )

    // 2. Todos los rivales de esos partidos con sus stats
    const rows = await this.prisma.matchOpponentPlayer.findMany({
      where: { match: matchWhere },
      include: { stats: true },
    })

    // 3. Sumar todos los stats (excepto points, que viene de opponentScore)
    const total = {
      matchesCount,
      minutes: 0,
      seconds: 0,
      points: totalOpponentScore, // ← del marcador final manual
      rebounds: 0,
      reboundsOff: 0,
      reboundsDef: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      fouls: 0,
      fieldGoalsMade: 0,
      fieldGoalsAttempted: 0,
      threePointersMade: 0,
      threePointersAttempted: 0,
      freeThrowsMade: 0,
      freeThrowsAttempted: 0,
      blocksAgainst: 0,
      foulsDrawn: 0,
      plusMinus: 0,
    }

    for (const row of rows) {
      const s = row.stats
      if (!s) continue
      total.minutes += s.minutes ?? 0
      total.seconds += s.seconds ?? 0
      total.rebounds += s.rebounds
      total.reboundsOff += s.reboundsOff
      total.reboundsDef += s.reboundsDef
      total.assists += s.assists
      total.steals += s.steals
      total.blocks += s.blocks
      total.turnovers += s.turnovers
      total.fouls += s.fouls
      total.fieldGoalsMade += s.fieldGoalsMade
      total.fieldGoalsAttempted += s.fieldGoalsAttempted
      total.threePointersMade += s.threePointersMade
      total.threePointersAttempted += s.threePointersAttempted
      total.freeThrowsMade += s.freeThrowsMade
      total.freeThrowsAttempted += s.freeThrowsAttempted
      total.blocksAgainst += s.blocksAgainst
      total.foulsDrawn += s.foulsDrawn
      total.plusMinus += s.plusMinus ?? 0
    }

    total.minutes += Math.floor(total.seconds / 60)
    total.seconds = total.seconds % 60

    return [
      {
        id: 'opponent-total',
        userId: null,
        number: 0,
        name: 'Rival',
        position: null,
        stats: total,
      },
    ]
  }

}