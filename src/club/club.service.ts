import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';

@Injectable()
export class ClubService {
  constructor(private prisma: PrismaService) {}

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
            role: 'ADMIN',
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
    const clubMembers = await this.prisma.clubMember.findMany({
      where: {
        userId: userId,
        isActive: true,
      },
      include: {
        club: {
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
              select: {
                id: true,
                name: true,
                category: true,
                season: true,
              },
            },
          },
        },
      },
    });

    return clubMembers.map(cm => cm.club);
  }

  async findOne(userId: string, clubId: string) {
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
            players: true,
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
    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: clubId,
        role: 'ADMIN',
        isActive: true,
      },
    });

    if (!member) {
      throw new ForbiddenException('No tienes permisos para editar este club');
    }

    return this.prisma.club.update({
      where: { id: clubId },
      data: updateClubDto,
    });
  }

  async remove(userId: string, clubId: string) {
    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: clubId,
        role: 'ADMIN',
        isActive: true,
      },
    });

    if (!member) {
      throw new ForbiddenException('No tienes permisos para eliminar este club');
    }

    return this.prisma.club.delete({
      where: { id: clubId },
    });
  }

  async inviteMember(userId: string, clubId: string, email: string) {
    const admin = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: clubId,
        role: 'ADMIN',
        isActive: true,
      },
    });

    if (!admin) {
      throw new ForbiddenException('No tienes permisos para invitar miembros');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const existingMember = await this.prisma.clubMember.findFirst({
      where: {
        userId: user.id,
        clubId: clubId,
      },
    });

    if (existingMember) {
      if (!existingMember.isActive) {
        return this.prisma.clubMember.update({
          where: { id: existingMember.id },
          data: { isActive: true },
        });
      }
      throw new ForbiddenException('El usuario ya es miembro del club');
    }

    return this.prisma.clubMember.create({
      data: {
        userId: user.id,
        clubId: clubId,
        role: 'COACH',
      },
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
    });
  }
}