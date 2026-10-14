import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmailSettingsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Lista todos los usuarios con email (no ghost, no borrados) con sus flags
   * de notificaciones por email.
   */
  async listUsers() {
    return this.prisma.user.findMany({
      where: {
        email: { not: null },
        isGhost: false,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        lastName: true,
        email: true,
        role: true,
        emailNotificationsEnabled: true,
        emailOptOut: true,
        createdAt: true,
      },
      orderBy: [
        { role: 'asc' },
        { lastName: 'asc' },
        { name: 'asc' },
      ],
    });
  }

  /**
   * Actualiza el flag `emailNotificationsEnabled` de un usuario.
   */
  async updateOne(userId: string, enabled: boolean) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, isGhost: true, deletedAt: true },
    });

    if (!user || user.deletedAt || user.isGhost) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { emailNotificationsEnabled: enabled },
      select: {
        id: true,
        name: true,
        lastName: true,
        email: true,
        role: true,
        emailNotificationsEnabled: true,
        emailOptOut: true,
      },
    });
  }

  /**
   * Actualiza el flag `emailNotificationsEnabled` para varios usuarios a la vez.
   *
   * Lote 8.5 — Fix: antes se hacía un `$transaction` con N updates concurrentes
   * (uno por usuario), que con muchos usuarios superaba el timeout de 5s de
   * las transacciones interactivas de Prisma. Ahora se hace en un único
   * `updateMany` con `WHERE id IN (...)`, mucho más rápido y sin transacción
   * explícita.
   *
   * Los userIds que no existen, no tienen email, son ghost, o están borrados
   * se ignoran silenciosamente. Solo se actualizan los válidos.
   */
  async updateBulk(userIds: string[], enabled: boolean) {
    if (userIds.length === 0) {
      return { updated: 0, enabled };
    }

    // Filtramos solo los usuarios válidos (con email, no ghost, no borrados).
    // Esto además protege contra IDs inexistentes o inválidos.
    const validUsers = await this.prisma.user.findMany({
      where: {
        id: { in: userIds },
        email: { not: null },
        isGhost: false,
        deletedAt: null,
      },
      select: { id: true },
    });

    const validIds = validUsers.map((u) => u.id);

    if (validIds.length === 0) {
      return { updated: 0, enabled };
    }

    // Una sola query: UPDATE "User" SET ... WHERE id IN (...)
    const result = await this.prisma.user.updateMany({
      where: { id: { in: validIds } },
      data: { emailNotificationsEnabled: enabled },
    });

    return {
      updated: result.count,
      enabled,
    };
  }
}