import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreatePlayerDto } from './dto/create-player.dto'

@Injectable()
export class PlayerService {
  constructor(private prisma: PrismaService) {}

  // ============================================
  // JUGADORES
  // ============================================

  async create(userId: string, createPlayerDto: CreatePlayerDto) {
    const team = await this.prisma.team.findUnique({
      where: { id: createPlayerDto.teamId },
    })

    if (!team) {
      throw new NotFoundException('Equipo no encontrado')
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: team.clubId,
        isActive: true,
      },
    })

    if (!member) {
      throw new ForbiddenException('No tienes acceso a este equipo')
    }

    return this.prisma.player.create({
      data: {
        name: createPlayerDto.name,
        lastName: createPlayerDto.lastName,
        birthDate: createPlayerDto.birthDate ? new Date(createPlayerDto.birthDate) : undefined,
        position: createPlayerDto.position,
        number: createPlayerDto.number,
        phone: createPlayerDto.phone,
        email: createPlayerDto.email,
        address: createPlayerDto.address,
        height: createPlayerDto.height,
        wingspan: createPlayerDto.wingspan,
        weight: createPlayerDto.weight,
        teamId: createPlayerDto.teamId,
      },
      include: {
        team: {
          include: {
            club: true,
          },
        },
      },
    })
  }

  async findAllByTeam(userId: string, teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    })

    if (!team) {
      throw new NotFoundException('Equipo no encontrado')
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: team.clubId,
        isActive: true,
      },
    })

    if (!member) {
      throw new ForbiddenException('No tienes acceso a este equipo')
    }

    return this.prisma.player.findMany({
      where: { teamId },
      include: {
        tutors: true,
      },
      orderBy: [
        { number: 'asc' },
        { lastName: 'asc' },
      ],
    })
  }

  async findOne(userId: string, playerId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: {
        team: {
          include: {
            club: true,
          },
        },
        tutors: {
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
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    })

    if (!player) {
      throw new NotFoundException('Jugador no encontrado')
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: player.team.clubId,
        isActive: true,
      },
    })

    if (!member) {
      throw new ForbiddenException('No tienes acceso a este jugador')
    }

    return player
  }

  async update(userId: string, playerId: string, updateData: any) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: { team: true },
    })

    if (!player) {
      throw new NotFoundException('Jugador no encontrado')
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: player.team.clubId,
        isActive: true,
      },
    })

    if (!member) {
      throw new ForbiddenException('No tienes permisos para editar este jugador')
    }

    const data: any = { ...updateData }

    // Convertir birthDate si existe
    if (data.birthDate) {
      data.birthDate = new Date(data.birthDate)
    }

    // Convertir números
    if (data.height) data.height = Number(data.height)
    if (data.wingspan) data.wingspan = Number(data.wingspan)
    if (data.weight) data.weight = Number(data.weight)
    if (data.number) data.number = Number(data.number)

    return this.prisma.player.update({
      where: { id: playerId },
      data,
      include: {
        team: {
          include: {
            club: true,
          },
        },
        tutors: true,
      },
    })
  }

  async remove(userId: string, playerId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: { team: true },
    })

    if (!player) {
      throw new NotFoundException('Jugador no encontrado')
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: player.team.clubId,
        isActive: true,
        role: 'ADMIN_CLUB',
      },
    })

    if (!member) {
      throw new ForbiddenException('No tienes permisos para eliminar este jugador')
    }

    return this.prisma.player.delete({
      where: { id: playerId },
    })
  }

  // ============================================
  // GESTIÓN DE TUTORES
  // ============================================

  async addTutor(userId: string, playerId: string, data: any) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: {
        team: {
          include: { club: true },
        },
      },
    })

    if (!player) {
      throw new NotFoundException('Jugador no encontrado')
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: player.team.clubId,
        isActive: true,
      },
    })

    if (!member) {
      throw new ForbiddenException('No tienes acceso a este jugador')
    }

    let tutorUserId: string | undefined = undefined
    if (data.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: data.email },
      })
      if (existingUser) {
        tutorUserId = existingUser.id
      }
    }

    return this.prisma.playerTutor.create({
      data: {
        playerId,
        userId: tutorUserId,
        name: data.name,
        lastName: data.lastName,
        relationship: data.relationship,
        phone: data.phone,
        email: data.email,
        canPickUp: data.canPickUp ?? true,
        isEmergencyContact: data.isEmergencyContact ?? false,
      },
    })
  }

  async getTutors(userId: string, playerId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: {
        team: {
          include: { club: true },
        },
        tutors: {
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
        },
      },
    })

    if (!player) {
      throw new NotFoundException('Jugador no encontrado')
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: player.team.clubId,
        isActive: true,
      },
    })

    if (!member) {
      throw new ForbiddenException('No tienes acceso a este jugador')
    }

    return player.tutors
  }

  async updateTutor(userId: string, tutorId: string, data: any) {
    const tutor = await this.prisma.playerTutor.findUnique({
      where: { id: tutorId },
      include: {
        player: {
          include: {
            team: {
              include: { club: true },
            },
          },
        },
      },
    })

    if (!tutor) {
      throw new NotFoundException('Tutor no encontrado')
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: tutor.player.team.clubId,
        isActive: true,
      },
    })

    if (!member) {
      throw new ForbiddenException('No tienes acceso a este tutor')
    }

    return this.prisma.playerTutor.update({
      where: { id: tutorId },
      data,
    })
  }

  async removeTutor(userId: string, tutorId: string) {
    const tutor = await this.prisma.playerTutor.findUnique({
      where: { id: tutorId },
      include: {
        player: {
          include: {
            team: {
              include: { club: true },
            },
          },
        },
      },
    })

    if (!tutor) {
      throw new NotFoundException('Tutor no encontrado')
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: tutor.player.team.clubId,
        isActive: true,
      },
    })

    if (!member) {
      throw new ForbiddenException('No tienes acceso a este tutor')
    }

    return this.prisma.playerTutor.delete({
      where: { id: tutorId },
    })
  }
}