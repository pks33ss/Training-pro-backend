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
  // MIS INVITACIONES PENDIENTES
  // IMPORTANTE: debe ir ANTES de `:code`
  // ============================================

  @Get('invitations/mine')
  getMine(@Request() req) {
    return this.invitationsService.findMineForUser(req.user.id)
  }

  // ============================================
  // PREVIEW PÚBLICA POR CÓDIGO
  // ============================================

  @Get('invitations/:code/preview')
  preview(@Param('code') code: string) {
    return this.invitationsService.previewByCode(code)
  }

  // ============================================
  // ACEPTAR / RECHAZAR INVITACIÓN
  // ============================================

  @Post('invitations/:code/accept')
  accept(@Request() req, @Param('code') code: string) {
    return this.invitationsService.acceptInvitation(code, req.user.id)
  }

  @Post('invitations/:code/reject')
  reject(@Request() req, @Param('code') code: string) {
    return this.invitationsService.rejectInvitation(code, req.user.id)
  }

  // ============================================
  // OBTENER INVITACIÓN POR CÓDIGO
  // ============================================

  @Get('invitations/:code')
  findByCode(@Param('code') code: string) {
    return this.invitationsService.findByCode(code)
  }

  // ============================================
  // MARCAR COMO USADA (legacy)
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