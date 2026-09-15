import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';

@Injectable()
export class TeamService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, createTeamDto: CreateTeamDto) {
    // Verificar que el usuario es miembro del club
    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: createTeamDto.clubId,
        isActive: true,
      },
    });

    if (!member) {
      throw new ForbiddenException('No tienes acceso a este club');
    }

    return this.prisma.team.create({
      data: {
        name: createTeamDto.name,
        category: createTeamDto.category,
        season: createTeamDto.season,
        clubId: createTeamDto.clubId,
      },
      include: {
        club: true,
      },
    });
  }

  async findAllByClub(userId: string, clubId: string) {
    // Verificar acceso al club
    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: clubId,
        isActive: true,
      },
    });

    if (!member) {
      throw new ForbiddenException('No tienes acceso a este club');
    }

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
    });
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
    });

    if (!team) {
      throw new NotFoundException('Equipo no encontrado');
    }

    // Verificar acceso
    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: team.clubId,
        isActive: true,
      },
    });

    if (!member) {
      throw new ForbiddenException('No tienes acceso a este equipo');
    }

    return team;
  }

  async update(userId: string, teamId: string, updateTeamDto: UpdateTeamDto) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team) {
      throw new NotFoundException('Equipo no encontrado');
    }

    // Verificar permisos (ADMIN del club o COACH del equipo)
    const isAdmin = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: team.clubId,
        role: 'ADMIN_CLUB',
        isActive: true,
      },
    });

    const isCoach = await this.prisma.teamMember.findFirst({
      where: {
        userId: userId,
        teamId: teamId,
        role: 'COACH',
        isActive: true,
      },
    });

    if (!isAdmin && !isCoach) {
      throw new ForbiddenException('No tienes permisos para editar este equipo');
    }

    return this.prisma.team.update({
      where: { id: teamId },
      data: updateTeamDto,
    });
  }

  async remove(userId: string, teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team) {
      throw new NotFoundException('Equipo no encontrado');
    }

    // Verificar permisos (solo ADMIN del club)
    const isAdmin = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: team.clubId,
        role: 'ADMIN_CLUB',
        isActive: true,
      },
    });

    if (!isAdmin) {
      throw new ForbiddenException('No tienes permisos para eliminar este equipo');
    }

    return this.prisma.team.delete({
      where: { id: teamId },
    });
  }

    // ============================================
  // GESTIÓN DE MIEMBROS DEL EQUIPO
  // ============================================

  async getMembers(userId: string, teamId: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
    })

    const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { club: true },
    })

    if (!team) {
      throw new NotFoundException('Equipo no encontrado')
    }

    // Verificar acceso al club o ser SUPER_ADMIN
    const clubMember = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: team.clubId,
        isActive: true,
      },
    })

    if (!clubMember && !isSuperAdmin) {
      throw new ForbiddenException('No tienes acceso a este equipo')
    }

    return this.prisma.teamMember.findMany({
      where: { teamId },
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
      orderBy: { joinedAt: 'asc' },
    })
  }

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

    // Verificar permisos: ADMIN_CLUB del club, COACH del equipo o SUPER_ADMIN
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

    // Buscar el usuario a invitar
    const userToInvite = await this.prisma.user.findUnique({
      where: { email },
    })

    if (!userToInvite) {
      throw new NotFoundException('Usuario no encontrado. Primero debe registrarse en la app.')
    }

    // Verificar si ya es miembro del equipo
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

    // Regla: No se puede eliminar al último COACH del equipo
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

    // Regla: Si solo queda un miembro, ese debe ser COACH
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
}