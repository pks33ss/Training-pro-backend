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
import { MembershipsService } from './memberships.service'
import { AuthGuard } from '../auth/auth.guard'
import { CreateMembershipDto, UpdateMembershipDto, AddMemberDto } from './dto'

@Controller()
@UseGuards(AuthGuard)
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  // ============================================
  // MIS MEMBERSHIPS
  // ============================================

  @Get('users/me/memberships')
  findMine(@Request() req) {
    return this.membershipsService.findMine(req.user.id)
  }

  // ============================================
  // MIEMBROS DE UN EQUIPO
  // ============================================

  @Get('teams/:teamId/members')
  findByTeam(@Request() req, @Param('teamId') teamId: string) {
    return this.membershipsService.findByTeam(req.user.id, teamId)
  }

    // ============================================
  // AÑADIR MIEMBRO EXISTENTE (directo, sin invitación)
  // ============================================

  @Post('teams/:teamId/members')
  addMember(
    @Request() req,
    @Param('teamId') teamId: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.membershipsService.addMember(req.user.id, teamId, dto)
  }

  // ============================================
  // SOLICITAR UNIRSE A UN EQUIPO
  // ============================================

  @Post('memberships')
  requestJoin(@Request() req, @Body() dto: CreateMembershipDto) {
    return this.membershipsService.requestJoin(req.user.id, dto)
  }

  // ============================================
  // ACEPTAR / RECHAZAR SOLICITUD
  // ============================================

  @Post('memberships/:id/accept')
  accept(@Request() req, @Param('id') id: string) {
    return this.membershipsService.accept(req.user.id, id)
  }

  @Post('memberships/:id/reject')
  reject(@Request() req, @Param('id') id: string) {
    return this.membershipsService.reject(req.user.id, id)
  }

  // ============================================
  // SALIR DEL EQUIPO
  // ============================================

  @Delete('memberships/:id')
  leave(@Request() req, @Param('id') id: string) {
    return this.membershipsService.leave(req.user.id, id)
  }

  // ============================================
// QUITAR MIEMBRO DEL EQUIPO (coach/admin echa a alguien)
// ============================================

@Delete('teams/:teamId/members/:membershipId')
remove(
  @Request() req,
  @Param('teamId') teamId: string,
  @Param('membershipId') membershipId: string,
) {
  return this.membershipsService.leave(req.user.id, membershipId)
}

  // ============================================
  // ACTUALIZAR MEMBERSHIP
  // ============================================

  @Put('memberships/:id')
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateMembershipDto,
  ) {
    return this.membershipsService.update(req.user.id, id, dto)
  }
}