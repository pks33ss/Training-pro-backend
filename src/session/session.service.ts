// backend/src/session/session.service.ts

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateSessionDto } from './dto/create-session.dto'
import { UpdateSessionDto } from './dto/update-session.dto'
import { AddExerciseDto } from './dto/add-exercise.dto'
import { UpdateExerciseDto } from './dto/update-exercise.dto'
import { canViewTeam } from '../common/access'
import { normalizeMembershipRolesList } from '../common/serialize'

@Injectable()
export class SessionService {
  constructor(private prisma: PrismaService) {}

  // ============================================
  // HELPERS
  // ============================================

  private async verifyTeamAccess(userId: string, teamId: string) {
    if (!(await canViewTeam(this.prisma, userId, teamId))) {
      throw new ForbiddenException('No tienes acceso a este equipo')
    }
  }

  // ============================================
  // SESIONES
  // ============================================

  async create(userId: string, dto: CreateSessionDto) {
    await this.verifyTeamAccess(userId, dto.teamId)

    return this.prisma.session.create({
      data: {
        title: dto.title,
        description: dto.description,
        date: new Date(dto.date),
        duration: dto.duration,
        location: dto.location,
        teamId: dto.teamId,
        createdById: userId,
      },
      include: {
        exercises: {
          orderBy: { order: 'asc' },
          include: { media: true },
        },
      },
    })
  }

  async findAllByTeam(userId: string, teamId: string) {
    await this.verifyTeamAccess(userId, teamId)

    return this.prisma.session.findMany({
      where: { teamId },
      include: {
        exercises: {
          orderBy: { order: 'asc' },
          include: { media: true },
        },
        // El listado de sesiones muestra un resumen de asistencia en cada
        // card. Sin `attendances` el frontend no puede calcularlo.
        attendances: true,
        // El icono de cada card depende del deporte del equipo.
        // Sin `team` el frontend no puede resolver el icono y cae al default.
        team: {
          select: {
            id: true,
            name: true,
            sport: true,
            club: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { date: 'desc' },
    })
  }

  async findOne(userId: string, sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        team: {
          include: {
            club: true,
            memberships: {
              where: {
                status: 'ACTIVE',
                roles: { some: { roleRef: { name: 'PLAYER' } } },
              },
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    lastName: true,
                    username: true,
                    avatar: true,
                  },
                },
                roles: {
                  include: { roleRef: { select: { name: true } } },
                },
              },
            },
          },
        },
        exercises: {
          orderBy: { order: 'asc' },
          include: { media: true },
        },
        attendances: true,
        createdBy: {
          select: { id: true, name: true, lastName: true, email: true },
        },
      },
    })

    if (!session) {
      throw new NotFoundException('Sesión no encontrada')
    }

    await this.verifyTeamAccess(userId, session.teamId)

    return {
      ...session,
      team: {
        ...session.team,
        memberships: normalizeMembershipRolesList(session.team.memberships),
      },
    }
  }

  async update(userId: string, sessionId: string, dto: UpdateSessionDto) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    })

    if (!session) {
      throw new NotFoundException('Sesión no encontrada')
    }

    await this.verifyTeamAccess(userId, session.teamId)

    const data: any = { ...dto }
    if (data.date) {
      data.date = new Date(data.date)
    }

    return this.prisma.session.update({
      where: { id: sessionId },
      data,
    })
  }

  async remove(userId: string, sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    })

    if (!session) {
      throw new NotFoundException('Sesión no encontrada')
    }

    await this.verifyTeamAccess(userId, session.teamId)

    return this.prisma.session.delete({
      where: { id: sessionId },
    })
  }

  // ============================================
  // EJERCICIOS
  // ============================================

  async addExercise(userId: string, sessionId: string, dto: AddExerciseDto) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    })

    if (!session) {
      throw new NotFoundException('Sesión no encontrada')
    }

    await this.verifyTeamAccess(userId, session.teamId)

    const lastExercise = await this.prisma.exercise.findFirst({
      where: { sessionId },
      orderBy: { order: 'desc' },
      select: { order: true },
    })

    const nextOrder =
      dto.order !== undefined ? dto.order : (lastExercise?.order ?? -1) + 1

    return this.prisma.exercise.create({
      data: {
        sessionId,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        duration: dto.duration,
        difficulty: dto.difficulty,
        order: nextOrder,
      },
      include: { media: true },
    })
  }

  async updateExercise(
    userId: string,
    exerciseId: string,
    dto: UpdateExerciseDto,
  ) {
    const exercise = await this.prisma.exercise.findUnique({
      where: { id: exerciseId },
      include: { session: true },
    })

    if (!exercise) {
      throw new NotFoundException('Ejercicio no encontrado')
    }

    await this.verifyTeamAccess(userId, exercise.session.teamId)

    return this.prisma.exercise.update({
      where: { id: exerciseId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.duration !== undefined && { duration: dto.duration }),
        ...(dto.difficulty !== undefined && { difficulty: dto.difficulty }),
        ...(dto.order !== undefined && { order: dto.order }),
      },
      include: { media: true },
    })
  }

  async removeExercise(userId: string, exerciseId: string) {
    const exercise = await this.prisma.exercise.findUnique({
      where: { id: exerciseId },
      include: { session: true },
    })

    if (!exercise) {
      throw new NotFoundException('Ejercicio no encontrado')
    }

    await this.verifyTeamAccess(userId, exercise.session.teamId)

    await this.prisma.exercise.delete({
      where: { id: exerciseId },
    })

    return { deleted: true }
  }

  async reorderExercises(
    userId: string,
    sessionId: string,
    exerciseIds: string[],
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    })

    if (!session) {
      throw new NotFoundException('Sesión no encontrada')
    }

    await this.verifyTeamAccess(userId, session.teamId)

    await this.prisma.$transaction(
      exerciseIds.map((id, index) =>
        this.prisma.exercise.update({
          where: { id },
          data: { order: index },
        }),
      ),
    )

    return { reordered: true }
  }

  // ============================================
  // MEDIA DE EJERCICIOS
  // ============================================

  async addMediaToExercise(
    userId: string,
    exerciseId: string,
    url: string,
    type: 'IMAGE' | 'LINK',
    title?: string,
    tacticalData?: any,  
  ) {
    const exercise = await this.prisma.exercise.findUnique({
      where: { id: exerciseId },
      include: { session: true },
    })

    if (!exercise) {
      throw new NotFoundException('Ejercicio no encontrado')
    }

    await this.verifyTeamAccess(userId, exercise.session.teamId)

    return this.prisma.media.create({
      data: {
        exerciseId,
        url,
        type: type as any,
        title,
        ...(tacticalData !== undefined && {
          tacticalData: tacticalData as any,
          }),
      },
    })
  }

  async removeMedia(userId: string, mediaId: string) {
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
      include: { exercise: { include: { session: true } } },
    })

    if (!media) {
      throw new NotFoundException('Media no encontrada')
    }

    await this.verifyTeamAccess(userId, media.exercise.session.teamId)

    await this.prisma.media.delete({
      where: { id: mediaId },
    })

    return { deleted: true }
  }
}