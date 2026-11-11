import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PermissionsService } from '../permissions/permissions.service'
import type { PermissionAction } from '../permissions/permissions.constants'

@Injectable()
export class SeasonService {
  constructor(
    private prisma: PrismaService,
    private permissions: PermissionsService,
  ) {}

  // ============================================
  // HELPERS (AHORA USAN `season`)
  // ============================================

  private async assertSeasonForTeam(
    userId: string,
    teamId: string,
    action: PermissionAction,
    message?: string,
  ): Promise<void> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { clubId: true },
    })
    if (!team) throw new NotFoundException('Equipo no encontrado')

    await this.permissions.assert(
      this.prisma,
      userId,
      'season', // ✅ CAMBIADO
      action,
      {
        clubId: team.clubId,
        teamId,
        message: message ?? `No tienes permiso para ${action} en planificación`,
      },
    )
  }

  private async assertSeasonForSeason(
    userId: string,
    seasonId: string,
    action: PermissionAction,
    message?: string,
  ): Promise<{ teamId: string; clubId: string }> {
    const season = await this.prisma.season.findUnique({
      where: { id: seasonId },
      select: { teamId: true, team: { select: { clubId: true } } },
    })
    if (!season) throw new NotFoundException('Temporada no encontrada')

    const clubId = season.team.clubId
    await this.permissions.assert(
      this.prisma,
      userId,
      'season', // ✅ CAMBIADO
      action,
      {
        clubId,
        teamId: season.teamId,
        message: message ?? `No tienes permiso para ${action} en planificación`,
      },
    )
    return { teamId: season.teamId, clubId }
  }

  private async assertSeasonForBlock(
    userId: string,
    blockId: string,
    action: PermissionAction,
    message?: string,
  ): Promise<{ seasonId: string; teamId: string; clubId: string }> {
    const block = await this.prisma.seasonBlock.findUnique({
      where: { id: blockId },
      select: {
        seasonId: true,
        season: {
          select: { teamId: true, team: { select: { clubId: true } } },
        },
      },
    })
    if (!block) throw new NotFoundException('Bloque no encontrado')

    const teamId = block.season.teamId
    const clubId = block.season.team.clubId

    await this.permissions.assert(
      this.prisma,
      userId,
      'season', // ✅ CAMBIADO
      action,
      {
        clubId,
        teamId,
        message: message ?? `No tienes permiso para ${action} en planificación`,
      },
    )
    return { seasonId: block.seasonId, teamId, clubId }
  }

  private async assertSeasonForSection(
    userId: string,
    sectionId: string,
    action: PermissionAction,
    message?: string,
  ): Promise<{
    blockId: string
    seasonId: string
    teamId: string
    clubId: string
  }> {
    const section = await this.prisma.seasonSection.findUnique({
      where: { id: sectionId },
      select: {
        blockId: true,
        block: {
          select: {
            seasonId: true,
            season: {
              select: { teamId: true, team: { select: { clubId: true } } },
            },
          },
        },
      },
    })
    if (!section) throw new NotFoundException('Sección no encontrada')

    const seasonId = section.block.seasonId
    const teamId = section.block.season.teamId
    const clubId = section.block.season.team.clubId

    await this.permissions.assert(
      this.prisma,
      userId,
      'season', // ✅ CAMBIADO
      action,
      {
        clubId,
        teamId,
        message: message ?? `No tienes permiso para ${action} en planificación`,
      },
    )
    return { blockId: section.blockId, seasonId, teamId, clubId }
  }

  // ============================================
  // SEASONS
  // ============================================

  async findAllByTeam(userId: string, teamId: string) {
    await this.assertSeasonForTeam(userId, teamId, 'view')
    return this.prisma.season.findMany({
      where: { teamId },
      include: { _count: { select: { blocks: true } } },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    })
  }

  async create(userId: string, data: {
    teamId: string
    name: string
    description?: string
    startDate?: string
    endDate?: string
    color?: string
  }) {
    await this.assertSeasonForTeam(userId, data.teamId, 'create')
    return this.prisma.season.create({
      data: {
        teamId: data.teamId,
        name: data.name,
        description: data.description,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        color: data.color,
      },
    })
  }

  async findOne(userId: string, seasonId: string) {
    const season = await this.prisma.season.findUnique({
      where: { id: seasonId },
      include: { team: { include: { club: true } } },
    })
    if (!season) throw new NotFoundException('Temporada no encontrada')

    const clubId = season.team.clubId
    const teamId = season.teamId

    await this.permissions.assert(
      this.prisma,
      userId,
      'season', // ✅ CAMBIADO
      'view',
      { clubId, teamId, message: 'No tienes permiso para ver esta temporada' },
    )

    const canManage = await this.permissions.can(
      this.prisma,
      userId,
      'season', // ✅ CAMBIADO
      'edit',
      { clubId, teamId },
    )

    const blocks = await this.prisma.seasonBlock.findMany({
      where: { seasonId },
      include: { sections: { orderBy: { order: 'asc' } } },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    })

    return { ...season, canManage, blocks }
  }

  async update(userId: string, seasonId: string, data: {
    name?: string
    description?: string
    startDate?: string | null
    endDate?: string | null
    color?: string | null
  }) {
    await this.assertSeasonForSeason(userId, seasonId, 'edit',
      'No tienes permiso para editar esta temporada')

    const updateData: any = { ...data }
    if (data.startDate !== undefined) updateData.startDate = data.startDate ? new Date(data.startDate) : null
    if (data.endDate !== undefined) updateData.endDate = data.endDate ? new Date(data.endDate) : null

    return this.prisma.season.update({
      where: { id: seasonId },
      data: updateData,
    })
  }

  async remove(userId: string, seasonId: string) {
    await this.assertSeasonForSeason(userId, seasonId, 'delete',
      'No tienes permiso para eliminar esta temporada')
    return this.prisma.season.delete({ where: { id: seasonId } })
  }

  // ============================================
  // BLOCKS
  // ============================================

  async createBlock(userId: string, seasonId: string, data: {
    name: string
    description?: string
    color?: string
    parentId?: string | null
    startDate?: string
    endDate?: string
  }) {
    await this.assertSeasonForSeason(userId, seasonId, 'create',
      'No tienes permiso para crear bloques')

    if (data.parentId) {
      const parent = await this.prisma.seasonBlock.findUnique({ where: { id: data.parentId } })
      if (!parent || parent.seasonId !== seasonId) throw new BadRequestException('El bloque padre no es válido')
    }

    const siblings = await this.prisma.seasonBlock.findMany({
      where: { seasonId, parentId: data.parentId ?? null },
      orderBy: { order: 'desc' },
      take: 1,
    })
    const nextOrder = siblings.length > 0 ? siblings[0].order + 1 : 0

    return this.prisma.seasonBlock.create({
      data: {
        seasonId,
        parentId: data.parentId ?? null,
        name: data.name,
        description: data.description,
        color: data.color,
        order: nextOrder,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
      },
      include: { sections: true, children: true },
    })
  }

  async updateBlock(userId: string, blockId: string, data: {
    name?: string
    description?: string | null
    color?: string | null
    startDate?: string | null
    endDate?: string | null
  }) {
    await this.assertSeasonForBlock(userId, blockId, 'edit',
      'No tienes permiso para editar este bloque')

    const updateData: any = { ...data }
    if (data.startDate !== undefined) updateData.startDate = data.startDate ? new Date(data.startDate) : null
    if (data.endDate !== undefined) updateData.endDate = data.endDate ? new Date(data.endDate) : null

    return this.prisma.seasonBlock.update({
      where: { id: blockId },
      data: updateData,
      include: { sections: { orderBy: { order: 'asc' } }, children: true },
    })
  }

  async removeBlock(userId: string, blockId: string) {
    await this.assertSeasonForBlock(userId, blockId, 'delete',
      'No tienes permiso para eliminar este bloque')
    return this.prisma.seasonBlock.delete({ where: { id: blockId } })
  }

  async reorderBlocks(
    userId: string,
    seasonId: string,
    blocks: { id: string; order: number; parentId: string | null }[],
  ) {
    await this.assertSeasonForSeason(userId, seasonId, 'edit',
      'No tienes permiso para reordenar bloques')

    await this.prisma.$transaction(
      blocks.map((b) =>
        this.prisma.seasonBlock.update({
          where: { id: b.id },
          data: { order: b.order, parentId: b.parentId },
        }),
      ),
    )
    return { ok: true }
  }

  // ============================================
  // SECTIONS
  // ============================================

  async createSection(userId: string, blockId: string, data: {
    name: string
    description?: string
    color?: string
    startDate?: string
    endDate?: string
  }) {
    await this.assertSeasonForBlock(userId, blockId, 'create',
      'No tienes permiso para crear secciones')

    const siblings = await this.prisma.seasonSection.findMany({
      where: { blockId },
      orderBy: { order: 'desc' },
      take: 1,
    })
    const nextOrder = siblings.length > 0 ? siblings[0].order + 1 : 0

    return this.prisma.seasonSection.create({
      data: {
        blockId,
        name: data.name,
        description: data.description,
        color: data.color,
        order: nextOrder,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
      },
    })
  }

  async updateSection(userId: string, sectionId: string, data: {
    name?: string
    description?: string | null
    color?: string | null
    startDate?: string | null
    endDate?: string | null
  }) {
    await this.assertSeasonForSection(userId, sectionId, 'edit',
      'No tienes permiso para editar esta sección')

    const updateData: any = { ...data }
    if (data.startDate !== undefined) updateData.startDate = data.startDate ? new Date(data.startDate) : null
    if (data.endDate !== undefined) updateData.endDate = data.endDate ? new Date(data.endDate) : null

    return this.prisma.seasonSection.update({
      where: { id: sectionId },
      data: updateData,
    })
  }

  async removeSection(userId: string, sectionId: string) {
    await this.assertSeasonForSection(userId, sectionId, 'delete',
      'No tienes permiso para eliminar esta sección')
    return this.prisma.seasonSection.delete({ where: { id: sectionId } })
  }

  async reorderSections(
    userId: string,
    blockId: string,
    sections: { id: string; order: number }[],
  ) {
    await this.assertSeasonForBlock(userId, blockId, 'edit',
      'No tienes permiso para reordenar secciones')

    await this.prisma.$transaction(
      sections.map((s) =>
        this.prisma.seasonSection.update({
          where: { id: s.id },
          data: { order: s.order },
        }),
      ),
    )
    return { ok: true }
  }
}