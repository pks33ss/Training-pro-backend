import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common'
import { InvitationsService } from './invitations.service'
import { CreateInvitationDto } from './dto'
import { AuthGuard } from '../auth/auth.guard'

@Controller()
@UseGuards(AuthGuard)
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  // ============================================
  // CREAR INVITACIÓN
  // ============================================

  @Post('invitations')
  create(@Request() req, @Body() dto: CreateInvitationDto) {
    return this.invitationsService.create(req.user.id, dto)
  }

  // ============================================
  // OBTENER INVITACIÓN POR CÓDIGO (público, sin auth)
  // Nota: si necesitas que sea público, hay que quitar el AuthGuard
  // y añadir @Public() con un decorador custom. Por ahora lo dejamos
  // protegido para simplificar.
  // ============================================

  @Get('invitations/:code')
  findByCode(@Param('code') code: string) {
    return this.invitationsService.findByCode(code)
  }

  // ============================================
  // MARCAR COMO USADA
  // ============================================

  @Post('invitations/:code/use')
  markAsUsed(@Request() req, @Param('code') code: string) {
    return this.invitationsService.markAsUsed(code, req.user.id)
  }

  // ============================================
  // LISTAR INVITACIONES DE UN EQUIPO
  // ============================================

  @Get('teams/:teamId/invitations')
  findByTeam(@Request() req, @Param('teamId') teamId: string) {
    return this.invitationsService.findByTeam(req.user.id, teamId)
  }

  // ============================================
  // REVOCAR INVITACIÓN
  // ============================================

  @Delete('invitations/:id')
  revoke(@Request() req, @Param('id') id: string) {
    return this.invitationsService.revoke(req.user.id, id)
  }
}