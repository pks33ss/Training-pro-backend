import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class FavoritesService {
  constructor(private prisma: PrismaService) {}

  // ============================================
  // HELPER: verificar acceso al equipo
  // ============================================

  private async canAccessTeam(userId: string, teamId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (user?.role === 'SUPER_ADMIN') return true

    const team = await this.prisma.team.findUnique({ where: { id: teamId } })
    if (!team) return false

    // 1) ClubMember (ADMIN_CLUB o cualquier ClubMember con acceso)
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

  // ============================================
  // LISTAR FAVORITOS
  // ============================================

  async getFavorites(userId: string) {
    return this.prisma.favoriteTeam.findMany({
      where: { userId },
      include: {
        team: {
          include: {
            club: {
              select: { id: true, name: true, logo: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
  }

  // ============================================
  // EQUIPO ACTIVO (el primero en favoritos)
  // ============================================

  async getActiveTeam(userId: string) {
    const favorite = await this.prisma.favoriteTeam.findFirst({
      where: { userId },
      include: {
        team: {
          include: {
            club: {
              select: { id: true, name: true, logo: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    return favorite?.team || null
  }

  // ============================================
  // AÑADIR A FAVORITOS
  // ============================================

  async addFavorite(userId: string, teamId: string) {
    // Verificar que el equipo existe
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    })
    if (!team) throw new NotFoundException('Equipo no encontrado')

    // Verificar acceso con la lógica unificada
    const hasAccess = await this.canAccessTeam(userId, teamId)
    if (!hasAccess) {
      throw new ForbiddenException('No tienes acceso a este equipo')
    }

    // Upsert (si ya existe, no falla)
    return this.prisma.favoriteTeam.upsert({
      where: {
        userId_teamId: { userId, teamId },
      },
      update: {},
      create: { userId, teamId },
      include: {
        team: {
          include: {
            club: { select: { id: true, name: true, logo: true } },
          },
        },
      },
    })
  }

  // ============================================
  // QUITAR DE FAVORITOS
  // ============================================

  async removeFavorite(userId: string, teamId: string) {
    const favorite = await this.prisma.favoriteTeam.findUnique({
      where: {
        userId_teamId: { userId, teamId },
      },
    })

    if (!favorite) {
      // No existe, no pasa nada
      return { ok: true }
    }

    await this.prisma.favoriteTeam.delete({
      where: { id: favorite.id },
    })

    return { ok: true }
  }

  // ============================================
  // COMPROBAR SI ES FAVORITO
  // ============================================

  async isFavorite(userId: string, teamId: string) {
    const favorite = await this.prisma.favoriteTeam.findUnique({
      where: {
        userId_teamId: { userId, teamId },
      },
    })
    return !!favorite
  }
}