import { Controller, Get, Post, Delete, Param, Request, UseGuards } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { FavoritesService } from './favorites.service'
import { AuthGuard } from '../auth/auth.guard'

@ApiTags('favorites')
@ApiBearerAuth('access-token')
@Controller('favorites')
@UseGuards(AuthGuard)
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar equipos favoritos del usuario' })
  getFavorites(@Request() req) {
    return this.favoritesService.getFavorites(req.user.id)
  }

  @Get('active-team')
  @ApiOperation({ summary: 'Equipo activo (primer favorito)' })
  getActiveTeam(@Request() req) {
    return this.favoritesService.getActiveTeam(req.user.id)
  }

  @Post(':teamId')
  @ApiOperation({ summary: 'Añadir equipo a favoritos' })
  addFavorite(@Request() req, @Param('teamId') teamId: string) {
    return this.favoritesService.addFavorite(req.user.id, teamId)
  }

  @Delete(':teamId')
  @ApiOperation({ summary: 'Quitar equipo de favoritos' })
  removeFavorite(@Request() req, @Param('teamId') teamId: string) {
    return this.favoritesService.removeFavorite(req.user.id, teamId)
  }

  @Get(':teamId/status')
  @ApiOperation({ summary: 'Comprobar si un equipo es favorito' })
  isFavorite(@Request() req, @Param('teamId') teamId: string) {
    return this.favoritesService.isFavorite(req.user.id, teamId).then((isFav) => ({ isFavorite: isFav }))
  }
}