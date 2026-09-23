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
import { TutorRelationshipsService } from './tutor-relationships.service'
import {
  CreateTutorRelationshipDto,
  UpdateTutorRelationshipDto,
} from './dto'
import { AuthGuard } from '../auth/auth.guard'

@Controller()
@UseGuards(AuthGuard)
export class TutorRelationshipsController {
  constructor(
    private readonly service: TutorRelationshipsService,
  ) {}

  // ============================================
  // MIS TUTORES (si soy jugador)
  // ============================================

  @Get('users/me/tutors')
  findMyTutors(@Request() req) {
    return this.service.findMyTutors(req.user.id)
  }

  // ============================================
  // MIS JUGADORES (si soy tutor)
  // ============================================

  @Get('users/me/players')
  findMyPlayers(@Request() req) {
    return this.service.findMyPlayers(req.user.id)
  }

  // ============================================
  // CREAR SOLICITUD
  // ============================================

  @Post('tutor-relationships')
  create(@Request() req, @Body() dto: CreateTutorRelationshipDto) {
    return this.service.create(req.user.id, dto)
  }

  // ============================================
  // APROBAR / RECHAZAR
  // ============================================

  @Post('tutor-relationships/:id/approve')
  approve(@Request() req, @Param('id') id: string) {
    return this.service.approve(req.user.id, id)
  }

  @Post('tutor-relationships/:id/reject')
  reject(@Request() req, @Param('id') id: string) {
    return this.service.reject(req.user.id, id)
  }

  // ============================================
  // REVOCAR VÍNCULO
  // ============================================

  @Delete('tutor-relationships/:id')
  revoke(@Request() req, @Param('id') id: string) {
    return this.service.revoke(req.user.id, id)
  }

  // ============================================
  // ACTUALIZAR
  // ============================================

  @Put('tutor-relationships/:id')
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateTutorRelationshipDto,
  ) {
    return this.service.update(req.user.id, id, dto)
  }
}