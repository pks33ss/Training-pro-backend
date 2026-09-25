import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { AddExerciseDto } from './dto/add-exercise.dto';

@Injectable()
export class SessionService {
  constructor(private prisma: PrismaService) {}

  // ============================================
  // HELPER: verificar acceso al equipo
  // ============================================

  private async canAccessTeam(userId: string, teamId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (user?.role === 'SUPER_ADMIN') return true

    const team = await this.prisma.team.findUnique({ where: { id: teamId } })
    if (!team) return false

    // 1) ClubMember (cualquiera con acceso al club)
    const clubMember = await this.prisma.clubMember.findFirst({
      where: { userId, clubId: team.clubId, isActive: true },
    })
    if (clubMember) return true

    // 2) TeamMembership activa (modelo nuevo)
    const membership = await this.prisma.teamMembership.findFirst({
      where: { userId, teamId, status: 'ACTIVE' },
    })
    if (membership) return true

    // 3) TeamMember antiguo (compatibilidad)
    const teamMember = await this.prisma.teamMember.findFirst({
      where: { userId, teamId, isActive: true },
    })
    return !!teamMember
  }

  private async canManageTeam(userId: string, teamId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (user?.role === 'SUPER_ADMIN') return true

    const team = await this.prisma.team.findUnique({ where: { id: teamId } })
    if (!team) return false

    // 1) ADMIN_CLUB del club
    const clubAdmin = await this.prisma.clubMember.findFirst({
      where: { userId, clubId: team.clubId, isActive: true, role: 'ADMIN_CLUB' },
    })
    if (clubAdmin) return true

    // 2) TeamMembership con rol de gestión (modelo nuevo)
    const membership = await this.prisma.teamMembership.findFirst({
      where: {
        userId,
        teamId,
        status: 'ACTIVE',
        role: { in: ['COACH', 'ASSISTANT', 'ADMIN_TEAM'] },
      },
    })
    if (membership) return true

    // 3) COACH del equipo (modelo antiguo)
    const coach = await this.prisma.teamMember.findFirst({
      where: { userId, teamId, isActive: true, role: 'COACH' },
    })
    return !!coach
  }

  // ============================================
  // SESIONES
  // ============================================

  async create(userId: string, createSessionDto: CreateSessionDto) {
    const date = new Date(createSessionDto.date);
    if (isNaN(date.getTime())) {
      throw new BadRequestException('La fecha proporcionada no es válida');
    }

    const team = await this.prisma.team.findUnique({
      where: { id: createSessionDto.teamId },
    });

    if (!team) {
      throw new NotFoundException('Equipo no encontrado');
    }

    if (!(await this.canManageTeam(userId, team.id))) {
      throw new ForbiddenException('No tienes permisos para crear sesiones en este equipo');
    }

    return this.prisma.session.create({
      data: {
        title: createSessionDto.title,
        description: createSessionDto.description,
        date: date,
        duration: createSessionDto.duration,
        location: createSessionDto.location,
        teamId: createSessionDto.teamId,
        createdById: userId,
      },
      include: {
        team: {
          include: {
            club: true,
          },
        },
        exercises: true,
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

    if (!(await this.canAccessTeam(userId, teamId))) {
      throw new ForbiddenException('No tienes acceso a este equipo');
    }

    return this.prisma.session.findMany({
      where: { teamId },
      orderBy: { date: 'desc' },
      include: {
        exercises: {
          orderBy: { order: 'asc' },
        },
        attendances: {
          include: {
            player: true,
          },
        },
      },
    });
  }

  async findOne(userId: string, sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        team: {
          include: {
            club: true,
            players: {
              where: { isActive: true },
              orderBy: { lastName: 'asc' },
            },
          },
        },
        exercises: {
          orderBy: { order: 'asc' },
          include: {
            media: true,
          },
        },
        attendances: {
          include: {
            player: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }

    if (!(await this.canAccessTeam(userId, session.teamId))) {
      throw new ForbiddenException('No tienes acceso a esta sesión');
    }

    return session;
  }

  async update(userId: string, sessionId: string, updateSessionDto: UpdateSessionDto) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { team: true },
    });

    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }

    if (!(await this.canManageTeam(userId, session.teamId))) {
      throw new ForbiddenException('No tienes permisos para editar esta sesión');
    }

    return this.prisma.session.update({
      where: { id: sessionId },
      data: {
        title: updateSessionDto.title,
        description: updateSessionDto.description,
        date: updateSessionDto.date ? new Date(updateSessionDto.date) : undefined,
        duration: updateSessionDto.duration,
        location: updateSessionDto.location,
      },
    });
  }

  async remove(userId: string, sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { team: true },
    });

    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }

    if (!(await this.canManageTeam(userId, session.teamId))) {
      throw new ForbiddenException('No tienes permisos para eliminar esta sesión');
    }

    return this.prisma.session.delete({
      where: { id: sessionId },
    });
  }

  // ============================================
  // EJERCICIOS
  // ============================================

  async addExercise(userId: string, sessionId: string, addExerciseDto: AddExerciseDto) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { team: true },
    });

    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }

    if (!(await this.canManageTeam(userId, session.teamId))) {
      throw new ForbiddenException('No tienes permisos para añadir ejercicios');
    }

    return this.prisma.exercise.create({
      data: {
        name: addExerciseDto.name,
        description: addExerciseDto.description,
        category: addExerciseDto.category,
        duration: addExerciseDto.duration,
        difficulty: addExerciseDto.difficulty,
        order: addExerciseDto.order || 0,
        sessionId: sessionId,
      },
    });
  }

  async updateExercise(userId: string, exerciseId: string, updateExerciseDto: any) {
    const exercise = await this.prisma.exercise.findUnique({
      where: { id: exerciseId },
      include: {
        session: {
          include: {
            team: true,
          },
        },
      },
    });

    if (!exercise) {
      throw new NotFoundException('Ejercicio no encontrado');
    }

    if (!(await this.canManageTeam(userId, exercise.session.teamId))) {
      throw new ForbiddenException('No tienes permisos para editar este ejercicio');
    }

    return this.prisma.exercise.update({
      where: { id: exerciseId },
      data: {
        name: updateExerciseDto.name,
        description: updateExerciseDto.description,
        category: updateExerciseDto.category,
        duration: updateExerciseDto.duration,
        difficulty: updateExerciseDto.difficulty,
        order: updateExerciseDto.order,
      },
    });
  }

  async reorderExercises(userId: string, sessionId: string, exerciseIds: string[]) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { team: true },
    });

    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }

    if (!(await this.canManageTeam(userId, session.teamId))) {
      throw new ForbiddenException('No tienes permisos para reordenar ejercicios');
    }

    const updates = exerciseIds.map((exerciseId, index) =>
      this.prisma.exercise.update({
        where: { id: exerciseId },
        data: { order: index },
      })
    );

    await this.prisma.$transaction(updates);

    return { message: 'Ejercicios reordenados correctamente' };
  }

  async removeExercise(userId: string, exerciseId: string) {
    const exercise = await this.prisma.exercise.findUnique({
      where: { id: exerciseId },
      include: {
        session: {
          include: {
            team: true,
          },
        },
      },
    });

    if (!exercise) {
      throw new NotFoundException('Ejercicio no encontrado');
    }

    if (!(await this.canManageTeam(userId, exercise.session.teamId))) {
      throw new ForbiddenException('No tienes permisos para eliminar este ejercicio');
    }

    return this.prisma.exercise.delete({
      where: { id: exerciseId },
    });
  }

  // ============================================
  // MEDIA (Imágenes y Links)
  // ============================================

  async addMediaToExercise(
    userId: string,
    exerciseId: string,
    url: string,
    type: 'IMAGE' | 'VIDEO' | 'LINK',
    title?: string,
  ) {
    const exercise = await this.prisma.exercise.findUnique({
      where: { id: exerciseId },
      include: {
        session: {
          include: {
            team: true,
          },
        },
      },
    });

    if (!exercise) {
      throw new NotFoundException('Ejercicio no encontrado');
    }

    if (!(await this.canManageTeam(userId, exercise.session.teamId))) {
      throw new ForbiddenException('No tienes permisos');
    }

    return this.prisma.media.create({
      data: {
        url,
        type,
        title,
        exerciseId,
      },
    });
  }

  async removeMedia(userId: string, mediaId: string) {
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
      include: {
        exercise: {
          include: {
            session: {
              include: {
                team: true,
              },
            },
          },
        },
      },
    });

    if (!media) {
      throw new NotFoundException('Media no encontrada');
    }

    if (!(await this.canManageTeam(userId, media.exercise.session.teamId))) {
      throw new ForbiddenException('No tienes permisos');
    }

    return this.prisma.media.delete({
      where: { id: mediaId },
    });
  }
}