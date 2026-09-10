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
        role: 'ADMIN',
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
        role: 'ADMIN',
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
}