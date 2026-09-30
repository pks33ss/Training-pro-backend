import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service'
import * as bcrypt from 'bcrypt'
import {
  isSuperAdmin,
  isClubAdmin,
  isActiveClubMember,
  canInviteToClub,
} from '../common/access'

@Injectable()
export class ClubService {
  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
  ) {}

  async create(userId: string, createClubDto: CreateClubDto) {
    const club = await this.prisma.club.create({
      data: {
        name: createClubDto.name,
        description: createClubDto.description,
        address: createClubDto.address,
        phone: createClubDto.phone,
        email: createClubDto.email,
        members: {
          create: {
            userId: userId,
            role: 'ADMIN_CLUB',
          },
        },
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
      },
    });

    return club;
  }

  async findAll(userId: string) {
    if (await isSuperAdmin(this.prisma, userId)) {
      return this.prisma.club.findMany({
        include: {
          members: {
            include: {
              user: {
                select: { id: true, name: true, lastName: true, email: true },
              },
            },
          },
          teams: {
            select: { id: true, name: true, category: true, season: true },
          },
        },
      })
    }

    const clubMembers = await this.prisma.clubMember.findMany({
      where: { userId: userId, isActive: true },
      include: {
        club: {
          include: {
            members: {
              include: {
                user: {
                  select: { id: true, name: true, lastName: true, email: true },
                },
              },
            },
            teams: {
              select: { id: true, name: true, category: true, season: true },
            },
          },
        },
      },
    })

    const memberships = await this.prisma.teamMembership.findMany({
      where: { userId, status: 'ACTIVE' },
      include: {
        team: {
          include: {
            club: {
              include: {
                members: {
                  include: {
                    user: {
                      select: { id: true, name: true, lastName: true, email: true },
                    },
                  },
                },
                teams: {
                  select: { id: true, name: true, category: true, season: true },
                },
              },
            },
          },
        },
      },
    })

    const clubMap = new Map<string, any>()
    for (const cm of clubMembers) clubMap.set(cm.club.id, cm.club)
    for (const m of memberships) {
      const club = m.team.club
      if (!clubMap.has(club.id)) clubMap.set(club.id, club)
    }

    return Array.from(clubMap.values())
  }

  async findOne(userId: string, clubId: string) {
    if (!(await isSuperAdmin(this.prisma, userId))) {
      const isActive = await isActiveClubMember(this.prisma, userId, clubId)
      if (!isActive) {
        const hasMembership = await this.prisma.teamMembership.findFirst({
          where: { userId, status: 'ACTIVE', team: { clubId } },
        })
        if (!hasMembership) {
          throw new ForbiddenException('No tienes acceso a este club');
        }
      }
    }

    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
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
        teams: {
          include: {
            memberships: {
              where: {
                status: 'ACTIVE',
                roles: { some: { role: 'PLAYER' } },
              },
              select: { id: true },
            },
          },
        },
      },
    });

    if (!club) {
      throw new NotFoundException('Club no encontrado');
    }

    return club;
  }

  async update(userId: string, clubId: string, updateClubDto: UpdateClubDto) {
    if (!(await isSuperAdmin(this.prisma, userId))) {
      if (!(await isClubAdmin(this.prisma, userId, clubId))) {
        throw new ForbiddenException('No tienes permisos para editar este club');
      }
    }

    return this.prisma.club.update({
      where: { id: clubId },
      data: updateClubDto,
    });
  }

  async remove(userId: string, clubId: string) {
    if (!(await isSuperAdmin(this.prisma, userId))) {
      if (!(await isClubAdmin(this.prisma, userId, clubId))) {
        throw new ForbiddenException('No tienes permisos para eliminar este club');
      }
    }

    return this.prisma.club.delete({
      where: { id: clubId },
    });
  }

  // ============================================
  // GESTIÓN DE MIEMBROS DEL CLUB
  // ============================================

  async getMembers(userId: string, clubId: string) {
    const isSuper = await isSuperAdmin(this.prisma, userId)
    const isActive = await isActiveClubMember(this.prisma, userId, clubId)

    if (!isActive && !isSuper) {
      throw new ForbiddenException('No tienes acceso a este club')
    }

    return this.prisma.clubMember.findMany({
      where: { clubId },
      include: {
        user: {
          select: { id: true, email: true, name: true, lastName: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    })
  }

  async inviteMember(userId: string, clubId: string, email: string, role: string) {
    if (!(await canInviteToClub(this.prisma, userId, clubId))) {
      throw new ForbiddenException('Solo los administradores del club pueden invitar miembros')
    }

    const userToInvite = await this.prisma.user.findUnique({
      where: { email },
    })

    if (!userToInvite) {
      throw new NotFoundException('Usuario no encontrado. Primero debe registrarse en la app.')
    }

    const existingMember = await this.prisma.clubMember.findFirst({
      where: { userId: userToInvite.id, clubId: clubId },
    })

    if (existingMember) {
      if (!existingMember.isActive) {
        return this.prisma.clubMember.update({
          where: { id: existingMember.id },
          data: { isActive: true, role: role as any },
          include: {
            user: {
              select: { id: true, email: true, name: true, lastName: true },
            },
          },
        })
      }
      throw new ForbiddenException('El usuario ya es miembro del club')
    }

    return this.prisma.clubMember.create({
      data: {
        userId: userToInvite.id,
        clubId: clubId,
        role: role as any,
      },
      include: {
        user: {
          select: { id: true, email: true, name: true, lastName: true },
        },
      },
    })
  }

  async updateMemberRole(userId: string, clubId: string, memberId: string, newRole: string) {
    if (!(await isSuperAdmin(this.prisma, userId))) {
      if (!(await isClubAdmin(this.prisma, userId, clubId))) {
        throw new ForbiddenException('Solo los administradores del club pueden cambiar roles')
      }
    }

    return this.prisma.clubMember.update({
      where: { id: memberId },
      data: { role: newRole as any },
      include: {
        user: {
          select: { id: true, email: true, name: true, lastName: true },
        },
      },
    })
  }

  async removeMember(userId: string, clubId: string, memberId: string) {
    if (!(await isSuperAdmin(this.prisma, userId))) {
      if (!(await isClubAdmin(this.prisma, userId, clubId))) {
        throw new ForbiddenException('Solo los administradores del club pueden eliminar miembros')
      }
    }

    const memberToDelete = await this.prisma.clubMember.findUnique({
      where: { id: memberId },
    })

    if (!memberToDelete) {
      throw new NotFoundException('Miembro no encontrado')
    }

    if (memberToDelete.userId === userId) {
      throw new ForbiddenException('No puedes eliminarte a ti mismo del club')
    }

    if (memberToDelete.role === 'ADMIN_CLUB') {
      const adminCount = await this.prisma.clubMember.count({
        where: {
          clubId: clubId,
          role: 'ADMIN_CLUB',
          isActive: true,
        },
      })

      if (adminCount <= 1) {
        throw new ForbiddenException('No puedes eliminar al último administrador del club. Promueve a otro miembro primero.')
      }
    }

    await this.prisma.teamMembership.updateMany({
      where: {
        userId: memberToDelete.userId,
        status: 'ACTIVE',
        team: { clubId },
      },
      data: {
        status: 'LEFT',
        leftAt: new Date(),
      },
    })

    const deletedMember = await this.prisma.clubMember.delete({
      where: { id: memberId },
    })

    const remainingMembers = await this.prisma.clubMember.findMany({
      where: { clubId, isActive: true },
    })

    if (remainingMembers.length === 1 && remainingMembers[0].role !== 'ADMIN_CLUB') {
      await this.prisma.clubMember.update({
        where: { id: remainingMembers[0].id },
        data: { role: 'ADMIN_CLUB' },
      })
    }

    return deletedMember
  }

  async resetMemberPassword(
    userId: string,
    clubId: string,
    memberId: string,
    newPassword: string,
  ) {
    if (!(await isSuperAdmin(this.prisma, userId))) {
      if (!(await isClubAdmin(this.prisma, userId, clubId))) {
        throw new ForbiddenException('Solo los administradores del club pueden resetear contraseñas')
      }
    }

    const member = await this.prisma.clubMember.findUnique({
      where: { id: memberId },
      include: { user: true },
    })

    if (!member) {
      throw new NotFoundException('Miembro no encontrado')
    }

    if (member.clubId !== clubId) {
      throw new ForbiddenException('Este miembro no pertenece a tu club')
    }

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

  // ============================================
  // GESTIÓN DE EQUIPOS POR MIEMBRO
  // ============================================

  async getMemberTeams(userId: string, clubId: string, memberId: string) {
    if (!(await isSuperAdmin(this.prisma, userId))) {
      if (!(await isClubAdmin(this.prisma, userId, clubId))) {
        throw new ForbiddenException('Solo los administradores del club pueden gestionar equipos')
      }
    }

    const member = await this.prisma.clubMember.findUnique({
      where: { id: memberId },
    })

    if (!member) {
      throw new NotFoundException('Miembro no encontrado')
    }

    const allTeams = await this.prisma.team.findMany({
      where: { clubId },
      orderBy: { name: 'asc' },
    })

    const memberMemberships = await this.prisma.teamMembership.findMany({
      where: {
        userId: member.userId,
        status: 'ACTIVE',
        team: { clubId },
      },
      select: {
        teamId: true,
        roles: true,
      },
    })

    const membershipMap = new Map(
      memberMemberships.map((m) => [
        m.teamId,
        m.roles.map((r) => r.role).join(', ') || 'PLAYER',
      ]),
    )

    return allTeams.map((team) => ({
      id: team.id,
      name: team.name,
      category: team.category,
      isAssigned: membershipMap.has(team.id),
      role: membershipMap.get(team.id) ?? null,
    }))
  }

  async addMemberToTeam(userId: string, clubId: string, memberId: string, teamId: string) {
    if (!(await isSuperAdmin(this.prisma, userId))) {
      if (!(await isClubAdmin(this.prisma, userId, clubId))) {
        throw new ForbiddenException('Solo los administradores del club pueden gestionar equipos')
      }
    }

    const team = await this.prisma.team.findFirst({
      where: { id: teamId, clubId },
    })

    if (!team) {
      throw new NotFoundException('Equipo no encontrado en este club')
    }

    const member = await this.prisma.clubMember.findUnique({
      where: { id: memberId },
    })

    if (!member) {
      throw new NotFoundException('Miembro no encontrado')
    }

    const existing = await this.prisma.teamMembership.findFirst({
      where: { userId: member.userId, teamId },
    })

    if (existing) {
      if (existing.status === 'ACTIVE') {
        throw new ForbiddenException('El miembro ya está asignado a este equipo')
      }
      return this.prisma.teamMembership.update({
        where: { id: existing.id },
        data: {
          status: 'ACTIVE',
          leftAt: null,
          joinedAt: new Date(),
          roles: {
            deleteMany: {},
            create: [{ role: 'COACH' }],
          },
        },
      })
    }

    return this.prisma.teamMembership.create({
      data: {
        userId: member.userId,
        teamId,
        status: 'ACTIVE',
        roles: { create: [{ role: 'COACH' }] },
      },
    })
  }

  async removeMemberFromTeam(userId: string, clubId: string, memberId: string, teamId: string) {
    if (!(await isSuperAdmin(this.prisma, userId))) {
      if (!(await isClubAdmin(this.prisma, userId, clubId))) {
        throw new ForbiddenException('Solo los administradores del club pueden gestionar equipos')
      }
    }

    const member = await this.prisma.clubMember.findUnique({
      where: { id: memberId },
    })

    if (!member) {
      throw new NotFoundException('Miembro no encontrado')
    }

    const membership = await this.prisma.teamMembership.findFirst({
      where: { userId: member.userId, teamId, status: 'ACTIVE' },
    })

    if (!membership) {
      throw new NotFoundException('El miembro no está asignado a este equipo')
    }

    return this.prisma.teamMembership.update({
      where: { id: membership.id },
      data: {
        status: 'LEFT',
        leftAt: new Date(),
      },
    })
  }

  // ============================================
  // SUBIR LOGO DEL CLUB
  // ============================================

  async uploadLogo(userId: string, clubId: string, base64Image: string) {
    if (!(await isSuperAdmin(this.prisma, userId))) {
      if (!(await isClubAdmin(this.prisma, userId, clubId))) {
        throw new ForbiddenException('No tienes permisos para editar este club')
      }
    }

    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
    })

    if (!club) {
      throw new NotFoundException('Club no encontrado')
    }

    const { url } = await this.cloudinaryService.uploadImage(
      base64Image,
      `training-pro/clubs/${clubId}`,
    )

    return this.prisma.club.update({
      where: { id: clubId },
      data: { logo: url },
    })
  }

  async removeLogo(userId: string, clubId: string) {
    if (!(await isSuperAdmin(this.prisma, userId))) {
      if (!(await isClubAdmin(this.prisma, userId, clubId))) {
        throw new ForbiddenException('No tienes permisos para editar este club')
      }
    }

    return this.prisma.club.update({
      where: { id: clubId },
      data: { logo: null },
    })
  }

  // ============================================
  // JUGADORES DEL CLUB (vista global)
  // ============================================

  async findClubPlayers(userId: string, clubId: string) {
    if (!(await isSuperAdmin(this.prisma, userId))) {
      const isActive = await isActiveClubMember(this.prisma, userId, clubId)
      if (!isActive) {
        throw new ForbiddenException('No tienes acceso a este club')
      }
    }

    const players = await this.prisma.user.findMany({
      where: {
        memberships: {
          some: {
            roles: { some: { role: 'PLAYER' } },
            status: 'ACTIVE',
            team: { clubId },
          },
        },
      },
      select: {
        id: true,
        username: true,
        name: true,
        lastName: true,
        avatar: true,
        bio: true,
        isGhost: true,
        memberships: {
          where: {
            roles: { some: { role: 'PLAYER' } },
            status: 'ACTIVE',
            team: { clubId },
          },
          include: {
            team: {
              select: {
                id: true,
                name: true,
                sport: true,
                category: true,
              },
            },
          },
          orderBy: { joinedAt: 'desc' },
        },
      },
      orderBy: [{ lastName: 'asc' }, { name: 'asc' }],
    })

    return players.map((player) => ({
      id: player.id,
      username: player.username,
      name: player.name,
      lastName: player.lastName,
      avatar: player.avatar,
      bio: player.bio,
      isGhost: player.isGhost,
      memberships: player.memberships.map((m) => ({
        id: m.id,
        teamId: m.team.id,
        teamName: m.team.name,
        teamSport: m.team.sport,
        teamCategory: m.team.category,
        jerseyNumber: m.jerseyNumber,
        position: m.position,
        joinedAt: m.joinedAt,
      })),
    }))
  }
}