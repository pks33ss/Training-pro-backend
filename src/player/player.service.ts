import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlayerDto } from './dto/create-player.dto';

@Injectable()
export class PlayerService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, createPlayerDto: CreatePlayerDto) {
    // Verificar acceso al equipo
    const team = await this.prisma.team.findUnique({
      where: { id: createPlayerDto.teamId },
    });

    if (!team) {
      throw new NotFoundException('Equipo no encontrado');
    }

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

    return this.prisma.player.create({
      data: {
        name: createPlayerDto.name,
        lastName: createPlayerDto.lastName,
        position: createPlayerDto.position,
        number: createPlayerDto.number,
        teamId: createPlayerDto.teamId,
      },
      include: {
        team: {
          include: {
            club: true,
          },
        },
      },
    });
  }

  async findAllByTeam(userId: string, teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team) {
      throw new NotFoundException('Equipo no encontrado');
    }

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

    return this.prisma.player.findMany({
      where: { teamId },
      orderBy: [
        { number: 'asc' },
        { lastName: 'asc' },
      ],
    });
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
      },
    });

    if (!player) {
      throw new NotFoundException('Jugador no encontrado');
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: player.team.clubId,
        isActive: true,
      },
    });

    if (!member) {
      throw new ForbiddenException('No tienes acceso a este jugador');
    }

    return player;
  }

  async update(userId: string, playerId: string, updateData: any) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: { team: true },
    });

    if (!player) {
      throw new NotFoundException('Jugador no encontrado');
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: player.team.clubId,
        isActive: true,
      },
    });

    if (!member) {
      throw new ForbiddenException('No tienes permisos para editar este jugador');
    }

    return this.prisma.player.update({
      where: { id: playerId },
      data: updateData,
    });
  }

  async remove(userId: string, playerId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: { team: true },
    });

    if (!player) {
      throw new NotFoundException('Jugador no encontrado');
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: player.team.clubId,
        isActive: true,
        role: 'ADMIN',
      },
    });

    if (!member) {
      throw new ForbiddenException('No tienes permisos para eliminar este jugador');
    }

    return this.prisma.player.delete({
      where: { id: playerId },
    });
  }
}