// backend/src/playbook/playbook.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { CreatePlayDto } from './dto/create-play.dto';
import { UpdatePlayDto } from './dto/update-play.dto';
import { AddStepDto } from './dto/add-step.dto';
import { UpdateStepDto } from './dto/update-step.dto';

@Injectable()
export class PlaybookService {
  constructor(
    private prisma: PrismaService,
    private permissionsService: PermissionsService, // ✅ Inyectamos el servicio de permisos
  ) {}

  // ============================================
  // FUNCIÓN AUXILIAR PARA MANEJAR EL JSON
  // ============================================
  private normalizeTacticalData(data: any): any {
    if (data === undefined) return undefined;
    if (data === null) return Prisma.DbNull;
    
    let parsed = data;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch (e) {
        return Prisma.DbNull;
      }
    }
    
    if (typeof parsed !== 'object' || parsed === null) {
      return Prisma.DbNull;
    }
    
    return parsed;
  }

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

    // ✅ Comprobamos document:create
    const canCreate = await this.permissionsService.can(
      this.prisma,
      userId,
      'document',
      'create',
      { clubId: team.clubId, teamId: team.id },
    );

    if (!canCreate) {
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

    // ✅ Comprobamos document:view (o team:view, pero usamos document:view para ser estrictos con la guía)
    const canView = await this.permissionsService.can(
      this.prisma,
      userId,
      'document',
      'view',
      { clubId: team.clubId, teamId: team.id },
    );

    if (!canView) {
      throw new ForbiddenException('No tienes acceso a este equipo');
    }

    const plays = await this.prisma.play.findMany({
      where: { teamId },
      orderBy: { createdAt: 'desc' },
      include: {
        steps: {
          orderBy: { order: 'asc' },
          select: { id: true },
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

    // TEMPORAL: Quitamos todas las comprobaciones de permisos
    return play;
  }

  async update(userId: string, id: string, dto: UpdatePlayDto) {
    const play = await this.prisma.play.findUnique({
      where: { id },
      include: { team: { select: { clubId: true } } }, // ✅ Necesitamos el clubId
    });

    if (!play) {
      throw new NotFoundException('Jugada no encontrada');
    }

    const canEdit = await this.permissionsService.can(
      this.prisma,
      userId,
      'document',
      'edit',
      { clubId: play.team.clubId, teamId: play.teamId },
    );

    if (!canEdit) {
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
      include: { team: { select: { clubId: true } } }, // ✅ Necesitamos el clubId
    });

    if (!play) {
      throw new NotFoundException('Jugada no encontrada');
    }

    const canDelete = await this.permissionsService.can(
      this.prisma,
      userId,
      'document',
      'delete',
      { clubId: play.team.clubId, teamId: play.teamId },
    );

    if (!canDelete) {
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
      include: { steps: true, team: { select: { clubId: true } } },
    });

    if (!play) {
      throw new NotFoundException('Jugada no encontrada');
    }

    // ✅ Permitimos si tiene document:edit O document:create
    const canEdit = await this.permissionsService.can(
      this.prisma, userId, 'document', 'edit', { clubId: play.team.clubId, teamId: play.teamId },
    );
    const canCreate = await this.permissionsService.can(
      this.prisma, userId, 'document', 'create', { clubId: play.team.clubId, teamId: play.teamId },
    );

    if (!canEdit && !canCreate) {
      throw new ForbiddenException(
        'No tienes permisos para editar esta jugada',
      );
    }

    const order = dto.order ?? play.steps.length;
    const tacticalDataProcessed = this.normalizeTacticalData(dto.tacticalData);

    return this.prisma.playStep.create({
      data: {
        playId,
        description: dto.description,
        imageUrl: dto.imageUrl,
        order,
        ...(tacticalDataProcessed !== undefined && {
          tacticalData: tacticalDataProcessed,
        }),
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
      include: { play: { include: { team: { select: { clubId: true } } } } },
    });

    if (!step || step.playId !== playId) {
      throw new NotFoundException('Paso no encontrado');
    }

    const canEdit = await this.permissionsService.can(
      this.prisma, userId, 'document', 'edit', { clubId: step.play.team.clubId, teamId: step.play.teamId },
    );
    const canCreate = await this.permissionsService.can(
      this.prisma, userId, 'document', 'create', { clubId: step.play.team.clubId, teamId: step.play.teamId },
    );

    if (!canEdit && !canCreate) {
      throw new ForbiddenException(
        'No tienes permisos para editar este paso',
      );
    }

    const data: any = {};
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.order !== undefined) data.order = dto.order;

    if (dto.tacticalData !== undefined) {
      data.tacticalData = this.normalizeTacticalData(dto.tacticalData);
    }

    return this.prisma.playStep.update({
      where: { id: stepId },
      data,
    });
  }

  async removeStep(userId: string, playId: string, stepId: string) {
    const step = await this.prisma.playStep.findUnique({
      where: { id: stepId },
      include: { play: { include: { team: { select: { clubId: true } } } } },
    });

    if (!step || step.playId !== playId) {
      throw new NotFoundException('Paso no encontrado');
    }

    const canDelete = await this.permissionsService.can(
      this.prisma, userId, 'document', 'delete', { clubId: step.play.team.clubId, teamId: step.play.teamId },
    );
    const canEdit = await this.permissionsService.can(
      this.prisma, userId, 'document', 'edit', { clubId: step.play.team.clubId, teamId: step.play.teamId },
    );

    if (!canDelete && !canEdit) {
      throw new ForbiddenException(
        'No tienes permisos para eliminar este paso',
      );
    }

    return this.prisma.playStep.delete({ where: { id: stepId } });
  }

  async reorderSteps(userId: string, playId: string, stepIds: string[]) {
    const play = await this.prisma.play.findUnique({
      where: { id: playId },
      include: { steps: true, team: { select: { clubId: true } } },
    });

    if (!play) {
      throw new NotFoundException('Jugada no encontrada');
    }

    const canEdit = await this.permissionsService.can(
      this.prisma, userId, 'document', 'edit', { clubId: play.team.clubId, teamId: play.teamId },
    );
    const canCreate = await this.permissionsService.can(
      this.prisma, userId, 'document', 'create', { clubId: play.team.clubId, teamId: play.teamId },
    );

    if (!canEdit && !canCreate) {
      throw new ForbiddenException(
        'No tienes permisos para reordenar los pasos',
      );
    }

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