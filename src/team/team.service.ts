import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateTeamDto } from './dto/create-team.dto'
import { UpdateTeamDto } from './dto/update-team.dto'

@Injectable()
export class TeamService {
  constructor(private prisma: PrismaService) {}

  // ============================================
  // CRUD EQUIPOS
  // ============================================

  async create(userId: string, createTeamDto: CreateTeamDto) {
    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: createTeamDto.clubId,
        isActive: true,
      },
    })

    if (!member) {
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
    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: clubId,
        isActive: true,
      },
    })

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
    })

    const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'

    if (!member && !isSuperAdmin) {
      throw new ForbiddenException('No tienes acceso a este club')
    }

    if (member?.role === 'ADMIN_CLUB' || isSuperAdmin) {
      return this.prisma.team.findMany({
        where: { clubId },
        include: {
          players: {
            select: {
              id: true,
              name: true,
              lastName: true,
              number: true,
            },
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
        },
      })
    }

    const teamMemberships = await this.prisma.teamMember.findMany({
      where: {
        userId: userId,
        isActive: true,
        team: {
          clubId: clubId,
        },
      },
      select: {
        teamId: true,
      },
    })

    const teamIds = teamMemberships.map(tm => tm.teamId)

    if (teamIds.length === 0) {
      return []
    }

    return this.prisma.team.findMany({
      where: {
        clubId,
        id: { in: teamIds },
      },
      include: {
        players: {
          select: {
            id: true,
            name: true,
            lastName: true,
            number: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    })
  }

    async findAllByClubWithMembers(userId: string, clubId: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
    })

    const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: clubId,
        isActive: true,
      },
    })

    if (!member && !isSuperAdmin) {
      throw new ForbiddenException('No tienes acceso a este club')
    }

    // ✅ ADMIN_CLUB y SUPER_ADMIN ven todos los equipos con miembros
    if (member?.role === 'ADMIN_CLUB' || isSuperAdmin) {
      return this.prisma.team.findMany({
        where: { clubId },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
          players: {
            select: {
              id: true,
              name: true,
              lastName: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      })
    }

    // ✅ COACH/ASSISTANT: solo ven equipos donde están asignados
    const teamMemberships = await this.prisma.teamMember.findMany({
      where: {
        userId: userId,
        isActive: true,
        team: { clubId: clubId },
      },
      select: { teamId: true },
    })

    const teamIds = teamMemberships.map(tm => tm.teamId)

    if (teamIds.length === 0) {
      return []
    }

    return this.prisma.team.findMany({
      where: {
        clubId,
        id: { in: teamIds },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        players: {
          select: {
            id: true,
            name: true,
            lastName: true,
          },
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
        players: true,
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    })

    if (!team) {
      throw new NotFoundException('Equipo no encontrado')
    }

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
    })

    const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'

    if (isSuperAdmin) {
      return team
    }

    const isClubAdmin = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: team.clubId,
        role: 'ADMIN_CLUB',
        isActive: true,
      },
    })

    if (isClubAdmin) {
      return team
    }

    const isTeamMember = await this.prisma.teamMember.findFirst({
      where: {
        userId: userId,
        teamId: teamId,
        isActive: true,
      },
    })

    if (!isTeamMember) {
      throw new ForbiddenException('No tienes acceso a este equipo')
    }

    return team
  }

  async update(userId: string, teamId: string, updateTeamDto: UpdateTeamDto) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    })

    if (!team) {
      throw new NotFoundException('Equipo no encontrado')
    }

    const isAdmin = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: team.clubId,
        role: 'ADMIN_CLUB',
        isActive: true,
      },
    })

    const isCoach = await this.prisma.teamMember.findFirst({
      where: {
        userId: userId,
        teamId: teamId,
        role: 'COACH',
        isActive: true,
      },
    })

    if (!isAdmin && !isCoach) {
      throw new ForbiddenException('No tienes permisos para editar este equipo')
    }

    return this.prisma.team.update({
      where: { id: teamId },
      data: updateTeamDto,
    })
  }

  async remove(userId: string, teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    })

    if (!team) {
      throw new NotFoundException('Equipo no encontrado')
    }

    const isAdmin = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: team.clubId,
        role: 'ADMIN_CLUB',
        isActive: true,
      },
    })

    if (!isAdmin) {
      throw new ForbiddenException('No tienes permisos para eliminar este equipo')
    }

    return this.prisma.team.delete({
      where: { id: teamId },
    })
  }

  // ============================================
  // GESTIÓN DE MIEMBROS
  // ============================================


  async inviteMember(userId: string, teamId: string, email: string, role: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
    })

    const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    })

    if (!team) {
      throw new NotFoundException('Equipo no encontrado')
    }

    const isClubAdmin = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: team.clubId,
        role: 'ADMIN_CLUB',
        isActive: true,
      },
    })

    const isTeamCoach = await this.prisma.teamMember.findFirst({
      where: {
        userId: userId,
        teamId: teamId,
        role: 'COACH',
        isActive: true,
      },
    })

    if (!isClubAdmin && !isTeamCoach && !isSuperAdmin) {
      throw new ForbiddenException('No tienes permisos para invitar miembros a este equipo')
    }

    const userToInvite = await this.prisma.user.findUnique({
      where: { email },
    })

    if (!userToInvite) {
      throw new NotFoundException('Usuario no encontrado. Primero debe registrarse en la app.')
    }

    const existingClubMember = await this.prisma.clubMember.findFirst({
      where: {
        userId: userToInvite.id,
        clubId: team.clubId,
      },
    })

    if (!existingClubMember) {
      await this.prisma.clubMember.create({
        data: {
          userId: userToInvite.id,
          clubId: team.clubId,
          role: 'COACH',
        },
      })
    } else if (!existingClubMember.isActive) {
      await this.prisma.clubMember.update({
        where: { id: existingClubMember.id },
        data: { isActive: true },
      })
    }

    const existingMember = await this.prisma.teamMember.findFirst({
      where: {
        userId: userToInvite.id,
        teamId: teamId,
      },
    })

    if (existingMember) {
      if (!existingMember.isActive) {
        return this.prisma.teamMember.update({
          where: { id: existingMember.id },
          data: { isActive: true, role: role as any },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                lastName: true,
              },
            },
          },
        })
      }
      throw new ForbiddenException('El usuario ya es miembro del equipo')
    }

    return this.prisma.teamMember.create({
      data: {
        userId: userToInvite.id,
        teamId: teamId,
        role: role as any,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            lastName: true,
          },
        },
      },
    })
  }

  async updateMemberRole(userId: string, teamId: string, memberId: string, newRole: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
    })

    const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    })

    if (!team) {
      throw new NotFoundException('Equipo no encontrado')
    }

    const isClubAdmin = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: team.clubId,
        role: 'ADMIN_CLUB',
        isActive: true,
      },
    })

    const isTeamCoach = await this.prisma.teamMember.findFirst({
      where: {
        userId: userId,
        teamId: teamId,
        role: 'COACH',
        isActive: true,
      },
    })

    if (!isClubAdmin && !isTeamCoach && !isSuperAdmin) {
      throw new ForbiddenException('No tienes permisos para cambiar roles en este equipo')
    }

    return this.prisma.teamMember.update({
      where: { id: memberId },
      data: { role: newRole as any },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            lastName: true,
          },
        },
      },
    })
  }

  async removeMember(userId: string, teamId: string, memberId: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
    })

    const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    })

    if (!team) {
      throw new NotFoundException('Equipo no encontrado')
    }

    const isClubAdmin = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: team.clubId,
        role: 'ADMIN_CLUB',
        isActive: true,
      },
    })

    const isTeamCoach = await this.prisma.teamMember.findFirst({
      where: {
        userId: userId,
        teamId: teamId,
        role: 'COACH',
        isActive: true,
      },
    })

    if (!isClubAdmin && !isTeamCoach && !isSuperAdmin) {
      throw new ForbiddenException('No tienes permisos para eliminar miembros de este equipo')
    }

    const memberToDelete = await this.prisma.teamMember.findUnique({
      where: { id: memberId },
    })

    if (memberToDelete?.userId === userId) {
      throw new ForbiddenException('No puedes eliminarte a ti mismo del equipo')
    }

    if (memberToDelete?.role === 'COACH') {
      const coachCount = await this.prisma.teamMember.count({
        where: {
          teamId: teamId,
          role: 'COACH',
          isActive: true,
        },
      })

      if (coachCount <= 1) {
        throw new ForbiddenException('No puedes eliminar al último entrenador del equipo. Promueve a otro miembro primero.')
      }
    }

    const deletedMember = await this.prisma.teamMember.delete({
      where: { id: memberId },
    })

    const remainingMembers = await this.prisma.teamMember.findMany({
      where: { teamId, isActive: true },
    })

    if (remainingMembers.length === 1 && remainingMembers[0].role !== 'COACH') {
      await this.prisma.teamMember.update({
        where: { id: remainingMembers[0].id },
        data: { role: 'COACH' },
      })
    }

    return deletedMember
  }

  async resetMemberPassword(userId: string, teamId: string, memberId: string, newPassword: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
    })

    const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    })

    if (!team) {
      throw new NotFoundException('Equipo no encontrado')
    }

    const isClubAdmin = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: team.clubId,
        role: 'ADMIN_CLUB',
        isActive: true,
      },
    })

    const isTeamCoach = await this.prisma.teamMember.findFirst({
      where: {
        userId: userId,
        teamId: teamId,
        role: 'COACH',
        isActive: true,
      },
    })

    if (!isClubAdmin && !isTeamCoach && !isSuperAdmin) {
      throw new ForbiddenException('No tienes permisos para resetear contraseñas en este equipo')
    }

    const member = await this.prisma.teamMember.findUnique({
      where: { id: memberId },
    })

    if (!member) {
      throw new NotFoundException('Miembro no encontrado')
    }

    const bcrypt = require('bcrypt')
    const hashedPassword = await bcrypt.hash(newPassword, 10)

    await this.prisma.user.update({
      where: { id: member.userId },
      data: { password: hashedPassword },
    })

    await this.prisma.refreshToken.updateMany({
      where: { userId: member.userId },
      data: { isRevoked: true },
    })

    return { message: 'Contraseña reseteada correctamente' }
  }
}