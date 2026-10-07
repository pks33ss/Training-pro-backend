import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLibraryExerciseDto } from './dto/create-library-exercise.dto';
import { UpdateLibraryExerciseDto } from './dto/update-library-exercise.dto';

const MAX_LIBRARY_EXERCISES = 500;

@Injectable()
export class LibraryService {
  constructor(private prisma: PrismaService) {}

  // ============================================
  // HELPERS
  // ============================================

  private normalizeTags(tags?: string[]): string[] {
    if (!tags || tags.length === 0) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of tags) {
      const t = (raw ?? '').trim().toLowerCase();
      if (!t) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
    return out;
  }

  // ============================================
  // CRUD
  // ============================================

  async create(userId: string, dto: CreateLibraryExerciseDto) {
    const count = await this.prisma.libraryExercise.count({
      where: { ownerId: userId },
    });

    if (count >= MAX_LIBRARY_EXERCISES) {
      throw new BadRequestException(
        `Has alcanzado el límite de ${MAX_LIBRARY_EXERCISES} ejercicios en tu biblioteca`,
      );
    }

    return this.prisma.libraryExercise.create({
      data: {
        ownerId: userId,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        tags: this.normalizeTags(dto.tags),
        duration: dto.duration,
        difficulty: dto.difficulty,
      },
      include: { media: true },
    });
  }

  async findAll(
    userId: string,
    filters: { q?: string; category?: string; difficulty?: string; tag?: string },
  ) {
    const where: any = { ownerId: userId };

    if (filters.q && filters.q.trim()) {
      where.name = { contains: filters.q.trim(), mode: 'insensitive' };
    }
    if (filters.category && filters.category.trim()) {
      where.category = filters.category.trim();
    }
    if (filters.difficulty && filters.difficulty.trim()) {
      where.difficulty = filters.difficulty.trim();
    }
    if (filters.tag && filters.tag.trim()) {
      where.tags = { has: filters.tag.trim().toLowerCase() };
    }

    return this.prisma.libraryExercise.findMany({
      where,
      include: { media: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const exercise = await this.prisma.libraryExercise.findFirst({
      where: { id, ownerId: userId },
      include: { media: true },
    });

    if (!exercise) {
      throw new NotFoundException('Ejercicio de biblioteca no encontrado');
    }

    return exercise;
  }

  async update(userId: string, id: string, dto: UpdateLibraryExerciseDto) {
    await this.ensureOwnership(userId, id);

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.duration !== undefined) data.duration = dto.duration;
    if (dto.difficulty !== undefined) data.difficulty = dto.difficulty;
    if (dto.tags !== undefined) data.tags = this.normalizeTags(dto.tags);

    return this.prisma.libraryExercise.update({
      where: { id },
      data,
      include: { media: true },
    });
  }

  async remove(userId: string, id: string) {
    await this.ensureOwnership(userId, id);
    return this.prisma.libraryExercise.delete({ where: { id } });
  }

  // ============================================
  // MEDIA
  // ============================================

  async addMedia(
    userId: string,
    exerciseId: string,
    url: string,
    type: 'IMAGE' | 'VIDEO' | 'LINK',
    title?: string,
    description?: string,
  ) {
    await this.ensureOwnership(userId, exerciseId);

    return this.prisma.libraryMedia.create({
      data: {
        url,
        type,
        title,
        description,
        libraryExerciseId: exerciseId,
      },
    });
  }

  async removeMedia(userId: string, mediaId: string) {
    const media = await this.prisma.libraryMedia.findFirst({
      where: {
        id: mediaId,
        libraryExercise: { ownerId: userId },
      },
    });

    if (!media) {
      throw new NotFoundException('Media no encontrada');
    }

    return this.prisma.libraryMedia.delete({ where: { id: mediaId } });
  }

  // ============================================
  // AUX
  // ============================================

  private async ensureOwnership(userId: string, exerciseId: string) {
    const exercise = await this.prisma.libraryExercise.findFirst({
      where: { id: exerciseId, ownerId: userId },
      select: { id: true },
    });

    if (!exercise) {
      throw new NotFoundException('Ejercicio de biblioteca no encontrado');
    }
  }
}