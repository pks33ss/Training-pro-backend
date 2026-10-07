import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { canViewTeam, canEditTeam } from '../common/access';
import { CreatePlayDto } from './dto/create-play.dto';
import { UpdatePlayDto } from './dto/update-play.dto';
import { AddStepDto } from './dto/add-step.dto';
import { UpdateStepDto } from './dto/update-step.dto';

@Injectable()
export class PlaybookService {
  constructor(private prisma: PrismaService) {}

  // ============================================
  // JUGADAS
  // ============================================

  async create(userId: string, dto: CreatePlayDto) {
    const team = await this.prisma.team.findUnique({
      where: { id: dto.teamId },
    });

    if (!team) {
      throw new NotFoundException('Equipo no encontrado');
    }

    if (!(await canEditTeam(this.prisma, userId, team.id))) {
      throw new ForbiddenException(
        'No tienes permisos para crear jugadas en este equipo',
      );
    }

    return this.prisma.play.create({
      data: {
        name: dto.name,
        description: dto.description,
        teamId: dto.teamId,
        createdById: userId,
      },
      include: {
        steps: { orderBy: { order: 'asc' } },
        createdBy: {
          select: { id: true, name: true, lastName: true, avatar: true },
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

    if (!(await canViewTeam(this.prisma, userId, teamId))) {
      throw new ForbiddenException('No tienes acceso a este equipo');
    }

    const plays = await this.prisma.play.findMany({
      where: { teamId },
      orderBy: { createdAt: 'desc' },
      include: {
        steps: {
          orderBy: { order: 'asc' },
          select: { id: true }, // solo contamos pasos
        },
        createdBy: {
          select: { id: true, name: true, lastName: true, avatar: true },
        },
      },
    });

    return plays.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      teamId: p.teamId,
      createdById: p.createdById,
      createdBy: p.createdBy,
      stepsCount: p.steps.length,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }

  async findOne(userId: string, id: string) {
    const play = await this.prisma.play.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { order: 'asc' } },
        createdBy: {
          select: { id: true, name: true, lastName: true, avatar: true },
        },
      },
    });

    if (!play) {
      throw new NotFoundException('Jugada no encontrada');
    }

    if (!(await canViewTeam(this.prisma, userId, play.teamId))) {
      throw new ForbiddenException('No tienes acceso a esta jugada');
    }

    return play;
  }

  async update(userId: string, id: string, dto: UpdatePlayDto) {
    const play = await this.prisma.play.findUnique({
      where: { id },
    });

    if (!play) {
      throw new NotFoundException('Jugada no encontrada');
    }

    if (!(await canEditTeam(this.prisma, userId, play.teamId))) {
      throw new ForbiddenException(
        'No tienes permisos para editar esta jugada',
      );
    }

    return this.prisma.play.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
      },
      include: {
        steps: { orderBy: { order: 'asc' } },
      },
    });
  }

  async remove(userId: string, id: string) {
    const play = await this.prisma.play.findUnique({
      where: { id },
    });

    if (!play) {
      throw new NotFoundException('Jugada no encontrada');
    }

    if (!(await canEditTeam(this.prisma, userId, play.teamId))) {
      throw new ForbiddenException(
        'No tienes permisos para eliminar esta jugada',
      );
    }

    return this.prisma.play.delete({ where: { id } });
  }

  // ============================================
  // PASOS
  // ============================================

  async addStep(userId: string, playId: string, dto: AddStepDto) {
    const play = await this.prisma.play.findUnique({
      where: { id: playId },
      include: { steps: true },
    });

    if (!play) {
      throw new NotFoundException('Jugada no encontrada');
    }

    if (!(await canEditTeam(this.prisma, userId, play.teamId))) {
      throw new ForbiddenException(
        'No tienes permisos para editar esta jugada',
      );
    }

    const order = dto.order ?? play.steps.length;

    return this.prisma.playStep.create({
      data: {
        playId,
        description: dto.description,
        imageUrl: dto.imageUrl,
        order,
      },
    });
  }

  async updateStep(
    userId: string,
    playId: string,
    stepId: string,
    dto: UpdateStepDto,
  ) {
    const step = await this.prisma.playStep.findUnique({
      where: { id: stepId },
      include: { play: true },
    });

    if (!step || step.playId !== playId) {
      throw new NotFoundException('Paso no encontrado');
    }

    if (!(await canEditTeam(this.prisma, userId, step.play.teamId))) {
      throw new ForbiddenException(
        'No tienes permisos para editar este paso',
      );
    }

    const data: any = {};
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.order !== undefined) data.order = dto.order;

    return this.prisma.playStep.update({
      where: { id: stepId },
      data,
    });
  }

  async removeStep(userId: string, playId: string, stepId: string) {
    const step = await this.prisma.playStep.findUnique({
      where: { id: stepId },
      include: { play: true },
    });

    if (!step || step.playId !== playId) {
      throw new NotFoundException('Paso no encontrado');
    }

    if (!(await canEditTeam(this.prisma, userId, step.play.teamId))) {
      throw new ForbiddenException(
        'No tienes permisos para eliminar este paso',
      );
    }

    return this.prisma.playStep.delete({ where: { id: stepId } });
  }

  async reorderSteps(userId: string, playId: string, stepIds: string[]) {
    const play = await this.prisma.play.findUnique({
      where: { id: playId },
      include: { steps: true },
    });

    if (!play) {
      throw new NotFoundException('Jugada no encontrada');
    }

    if (!(await canEditTeam(this.prisma, userId, play.teamId))) {
      throw new ForbiddenException(
        'No tienes permisos para reordenar los pasos',
      );
    }

    // Verificamos que todos los stepIds pertenecen a la jugada
    const validIds = new Set(play.steps.map((s) => s.id));
    for (const id of stepIds) {
      if (!validIds.has(id)) {
        throw new NotFoundException(
          `El paso ${id} no pertenece a esta jugada`,
        );
      }
    }

    const updates = stepIds.map((stepId, index) =>
      this.prisma.playStep.update({
        where: { id: stepId },
        data: { order: index },
      }),
    );

    await this.prisma.$transaction(updates);

    return { message: 'Pasos reordenados correctamente' };
  }
}