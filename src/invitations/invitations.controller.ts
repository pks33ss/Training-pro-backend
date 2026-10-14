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
import { PermissionsGuard } from '../permissions/permissions.guard'
import { RequirePermission } from '../permissions/require-permission.decorator'

@Controller()
@UseGuards(AuthGuard, PermissionsGuard)
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  // Crear invitación: el teamId va en el body. No podemos pre-chequear
  // sin query. El servicio (`assertCanManageMembers`) ya lo comprueba.
  @Post('invitations')
  create(@Request() req, @Body() dto: CreateInvitationDto) {
    return this.invitationsService.create(req.user.id, dto)
  }

  @Get('invitations/mine')
  getMine(@Request() req) {
    return this.invitationsService.findMineForUser(req.user.id)
  }

  // Público: sin chequeo.
  @Get('invitations/:code/preview')
  preview(@Param('code') code: string) {
    return this.invitationsService.previewByCode(code)
  }

  // Público (o del propio user): sin chequeo.
  @Post('invitations/:code/accept')
  accept(@Request() req, @Param('code') code: string) {
    return this.invitationsService.acceptInvitation(code, req.user.id)
  }

  @Post('invitations/:code/reject')
  reject(@Request() req, @Param('code') code: string) {
    return this.invitationsService.rejectInvitation(code, req.user.id)
  }

  @Get('invitations/:code')
  findByCode(@Param('code') code: string) {
    return this.invitationsService.findByCode(code)
  }

  @Post('invitations/:code/use')
  markAsUsed(@Request() req, @Param('code') code: string) {
    return this.invitationsService.markAsUsed(code, req.user.id)
  }

  @Get('teams/:teamId/invitations')
  @RequirePermission('invitation', 'view', {
    teamIdFrom: { param: 'teamId' },
  })
  findByTeam(@Request() req, @Param('teamId') teamId: string) {
    return this.invitationsService.findByTeam(req.user.id, teamId)
  }

  @Delete('invitations/:id')
  revoke(@Request() req, @Param('id') id: string) {
    return this.invitationsService.revoke(req.user.id, id)
  }
}