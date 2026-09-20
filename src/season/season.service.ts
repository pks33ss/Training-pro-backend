import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class SeasonService {
  constructor(private prisma: PrismaService) {}

  // ============================================
  // HELPERS
  // ============================================

  private async verifyTeamAccess(userId: string, teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { club: true },
    })
    if (!team) throw new NotFoundException('Equipo no encontrado')

    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (user?.role === 'SUPER_ADMIN') return team

    const clubMember = await this.prisma.clubMember.findFirst({
      where: { userId, clubId: team.clubId, isActive: true },
    })
    if (clubMember) return team

    const teamMember = await this.prisma.teamMember.findFirst({
      where: { userId, teamId, isActive: true },
    })
    if (!teamMember) throw new ForbiddenException('No tienes acceso a este equipo')

    return team
  }

  private async canManage(userId: string, teamId: string) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } })
    if (!team) throw new NotFoundException('Equipo no encontrado')

    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (user?.role === 'SUPER_ADMIN') return true

    // ADMIN_CLUB del club
    const adminClub = await this.prisma.clubMember.findFirst({
      where: { userId, clubId: team.clubId, isActive: true, role: 'ADMIN_CLUB' },
    })
    if (adminClub) return true

    // COACH del equipo
    const coach = await this.prisma.teamMember.findFirst({
      where: { userId, teamId, isActive: true, role: 'COACH' },
    })
    return !!coach
  }

  // ============================================
  // SEASONS
  // ============================================

  async findAllByTeam(userId: string, teamId: string) {
    await this.verifyTeamAccess(userId, teamId)

    return this.prisma.season.findMany({
      where: { teamId },
      include: {
        _count: { select: { blocks: true } },
      },
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
    await this.verifyTeamAccess(userId, data.teamId)
    if (!(await this.canManage(userId, data.teamId))) {
      throw new ForbiddenException('No tienes permiso para crear temporadas')
    }

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
      include: {
        team: {
          include: { club: true },
        },
      },
    })
    if (!season) throw new NotFoundException('Temporada no encontrada')

    await this.verifyTeamAccess(userId, season.teamId)
    const canManage = await this.canManage(userId, season.teamId)

    // ✅ Lista PLANA de bloques + secciones (el frontend monta el árbol)
    const blocks = await this.prisma.seasonBlock.findMany({
      where: { seasonId },
      include: {
        sections: {
          orderBy: { order: 'asc' },
        },
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    })

    return {
      ...season,
      canManage,
      blocks,
    }
  }

  async update(userId: string, seasonId: string, data: {
    name?: string
    description?: string
    startDate?: string | null
    endDate?: string | null
    color?: string | null
  }) {
    const season = await this.prisma.season.findUnique({ where: { id: seasonId } })
    if (!season) throw new NotFoundException('Temporada no encontrada')

    await this.verifyTeamAccess(userId, season.teamId)
    if (!(await this.canManage(userId, season.teamId))) {
      throw new ForbiddenException('No tienes permiso para editar esta temporada')
    }

    const updateData: any = { ...data }
    if (data.startDate !== undefined) {
      updateData.startDate = data.startDate ? new Date(data.startDate) : null
    }
    if (data.endDate !== undefined) {
      updateData.endDate = data.endDate ? new Date(data.endDate) : null
    }

    return this.prisma.season.update({
      where: { id: seasonId },
      data: updateData,
    })
  }

  async remove(userId: string, seasonId: string) {
    const season = await this.prisma.season.findUnique({ where: { id: seasonId } })
    if (!season) throw new NotFoundException('Temporada no encontrada')

    await this.verifyTeamAccess(userId, season.teamId)
    if (!(await this.canManage(userId, season.teamId))) {
      throw new ForbiddenException('No tienes permiso para eliminar esta temporada')
    }

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
    const season = await this.prisma.season.findUnique({ where: { id: seasonId } })
    if (!season) throw new NotFoundException('Temporada no encontrada')

    await this.verifyTeamAccess(userId, season.teamId)
    if (!(await this.canManage(userId, season.teamId))) {
      throw new ForbiddenException('No tienes permiso para crear bloques')
    }

    // Validar parentId si existe
    if (data.parentId) {
      const parent = await this.prisma.seasonBlock.findUnique({
        where: { id: data.parentId },
      })
      if (!parent || parent.seasonId !== seasonId) {
        throw new BadRequestException('El bloque padre no es válido')
      }
    }

    // Calcular el siguiente order entre los hermanos
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
    const block = await this.prisma.seasonBlock.findUnique({
      where: { id: blockId },
      include: { season: true },
    })
    if (!block) throw new NotFoundException('Bloque no encontrado')

    await this.verifyTeamAccess(userId, block.season.teamId)
    if (!(await this.canManage(userId, block.season.teamId))) {
      throw new ForbiddenException('No tienes permiso para editar este bloque')
    }

    const updateData: any = { ...data }
    if (data.startDate !== undefined) {
      updateData.startDate = data.startDate ? new Date(data.startDate) : null
    }
    if (data.endDate !== undefined) {
      updateData.endDate = data.endDate ? new Date(data.endDate) : null
    }

    return this.prisma.seasonBlock.update({
      where: { id: blockId },
      data: updateData,
      include: { sections: { orderBy: { order: 'asc' } }, children: true },
    })
  }

  async removeBlock(userId: string, blockId: string) {
    const block = await this.prisma.seasonBlock.findUnique({
      where: { id: blockId },
      include: { season: true },
    })
    if (!block) throw new NotFoundException('Bloque no encontrado')

    await this.verifyTeamAccess(userId, block.season.teamId)
    if (!(await this.canManage(userId, block.season.teamId))) {
      throw new ForbiddenException('No tienes permiso para eliminar este bloque')
    }

    // ✅ Cascade borra hijos y secciones automáticamente
    return this.prisma.seasonBlock.delete({ where: { id: blockId } })
  }

  async reorderBlocks(userId: string, seasonId: string, blocks: { id: string; order: number; parentId: string | null }[]) {
    const season = await this.prisma.season.findUnique({ where: { id: seasonId } })
    if (!season) throw new NotFoundException('Temporada no encontrada')

    await this.verifyTeamAccess(userId, season.teamId)
    if (!(await this.canManage(userId, season.teamId))) {
      throw new ForbiddenException('No tienes permiso para reordenar')
    }

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
    const block = await this.prisma.seasonBlock.findUnique({
      where: { id: blockId },
      include: { season: true },
    })
    if (!block) throw new NotFoundException('Bloque no encontrado')

    await this.verifyTeamAccess(userId, block.season.teamId)
    if (!(await this.canManage(userId, block.season.teamId))) {
      throw new ForbiddenException('No tienes permiso para crear secciones')
    }

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
    const section = await this.prisma.seasonSection.findUnique({
      where: { id: sectionId },
      include: { block: { include: { season: true } } },
    })
    if (!section) throw new NotFoundException('Sección no encontrada')

    await this.verifyTeamAccess(userId, section.block.season.teamId)
    if (!(await this.canManage(userId, section.block.season.teamId))) {
      throw new ForbiddenException('No tienes permiso para editar esta sección')
    }

    const updateData: any = { ...data }
    if (data.startDate !== undefined) {
      updateData.startDate = data.startDate ? new Date(data.startDate) : null
    }
    if (data.endDate !== undefined) {
      updateData.endDate = data.endDate ? new Date(data.endDate) : null
    }

    return this.prisma.seasonSection.update({
      where: { id: sectionId },
      data: updateData,
    })
  }

  async removeSection(userId: string, sectionId: string) {
    const section = await this.prisma.seasonSection.findUnique({
      where: { id: sectionId },
      include: { block: { include: { season: true } } },
    })
    if (!section) throw new NotFoundException('Sección no encontrada')

    await this.verifyTeamAccess(userId, section.block.season.teamId)
    if (!(await this.canManage(userId, section.block.season.teamId))) {
      throw new ForbiddenException('No tienes permiso para eliminar esta sección')
    }

    return this.prisma.seasonSection.delete({ where: { id: sectionId } })
  }

  async reorderSections(userId: string, blockId: string, sections: { id: string; order: number }[]) {
    const block = await this.prisma.seasonBlock.findUnique({
      where: { id: blockId },
      include: { season: true },
    })
    if (!block) throw new NotFoundException('Bloque no encontrado')

    await this.verifyTeamAccess(userId, block.season.teamId)
    if (!(await this.canManage(userId, block.season.teamId))) {
      throw new ForbiddenException('No tienes permiso para reordenar')
    }

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