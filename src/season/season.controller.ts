import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { SeasonService } from './season.service'
import { AuthGuard } from '../auth/auth.guard'
import { PermissionsGuard } from '../permissions/permissions.guard'
import { RequirePermission } from '../permissions/require-permission.decorator'

@ApiTags('seasons')
@ApiBearerAuth('access-token')
@Controller('seasons')
@UseGuards(AuthGuard, PermissionsGuard)
export class SeasonController {
  constructor(private readonly seasonService: SeasonService) {}

  // ============================================
  // SEASONS
  // ============================================

  @Get('team/:teamId')
  @RequirePermission('season', 'view', {
    teamIdFrom: { param: 'teamId' },
  })
  @ApiOperation({ summary: 'Listar temporadas de un equipo' })
  findAllByTeam(@Request() req, @Param('teamId') teamId: string) {
    return this.seasonService.findAllByTeam(req.user.id, teamId)
  }

  @Post()
  @RequirePermission('season', 'create', {
    teamIdFrom: { body: 'teamId' },
  })
  @ApiOperation({ summary: 'Crear temporada' })
  create(@Request() req, @Body() body: any) {
    return this.seasonService.create(req.user.id, body)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener temporada con sus bloques' })
  findOne(@Request() req, @Param('id') id: string) {
    // Sin @RequirePermission: el service resuelve teamId/clubId desde el seasonId.
    return this.seasonService.findOne(req.user.id, id)
  }

  @Put(':id')
  @ApiOperation({ summary: 'Editar temporada' })
  update(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.seasonService.update(req.user.id, id, body)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar temporada' })
  remove(@Request() req, @Param('id') id: string) {
    return this.seasonService.remove(req.user.id, id)
  }

  // ============================================
  // BLOCKS
  // ============================================

  @Post(':seasonId/blocks')
  @ApiOperation({ summary: 'Crear bloque' })
  createBlock(
    @Request() req,
    @Param('seasonId') seasonId: string,
    @Body() body: any,
  ) {
    return this.seasonService.createBlock(req.user.id, seasonId, body)
  }

  @Put('blocks/:blockId')
  @ApiOperation({ summary: 'Editar bloque' })
  updateBlock(
    @Request() req,
    @Param('blockId') blockId: string,
    @Body() body: any,
  ) {
    return this.seasonService.updateBlock(req.user.id, blockId, body)
  }

  @Delete('blocks/:blockId')
  @ApiOperation({ summary: 'Eliminar bloque (cascade)' })
  removeBlock(@Request() req, @Param('blockId') blockId: string) {
    return this.seasonService.removeBlock(req.user.id, blockId)
  }

  @Put(':seasonId/blocks/reorder')
  @ApiOperation({ summary: 'Reordenar bloques' })
  reorderBlocks(
    @Request() req,
    @Param('seasonId') seasonId: string,
    @Body('blocks') blocks: any[],
  ) {
    return this.seasonService.reorderBlocks(req.user.id, seasonId, blocks)
  }

  // ============================================
  // SECTIONS
  // ============================================

  @Post('blocks/:blockId/sections')
  @ApiOperation({ summary: 'Crear sección' })
  createSection(
    @Request() req,
    @Param('blockId') blockId: string,
    @Body() body: any,
  ) {
    return this.seasonService.createSection(req.user.id, blockId, body)
  }

  @Put('sections/:sectionId')
  @ApiOperation({ summary: 'Editar sección' })
  updateSection(
    @Request() req,
    @Param('sectionId') sectionId: string,
    @Body() body: any,
  ) {
    return this.seasonService.updateSection(req.user.id, sectionId, body)
  }

  @Delete('sections/:sectionId')
  @ApiOperation({ summary: 'Eliminar sección' })
  removeSection(@Request() req, @Param('sectionId') sectionId: string) {
    return this.seasonService.removeSection(req.user.id, sectionId)
  }

  @Put('blocks/:blockId/sections/reorder')
  @ApiOperation({ summary: 'Reordenar secciones' })
  reorderSections(
    @Request() req,
    @Param('blockId') blockId: string,
    @Body('sections') sections: any[],
  ) {
    return this.seasonService.reorderSections(req.user.id, blockId, sections)
  }
}