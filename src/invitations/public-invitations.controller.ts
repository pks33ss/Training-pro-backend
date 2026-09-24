import { Controller, Get, Param } from '@nestjs/common'
import { InvitationsService } from './invitations.service'

/**
 * Controlador PÚBLICO para invitaciones.
 * No usa AuthGuard porque el usuario que llega al registro
 * aún no tiene sesión.
 */
@Controller('public/invitations')
export class PublicInvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get(':code')
  findByCode(@Param('code') code: string) {
    return this.invitationsService.findByCode(code)
  }
}