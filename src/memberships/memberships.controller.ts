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
import { PermissionsGuard } from '../permissions/permissions.guard'
import { RequirePermission } from '../permissions/require-permission.decorator'
import { CreateMembershipDto, UpdateMembershipDto, AddMemberDto } from './dto'

@Controller()
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  // ─────────────────────────────────────────
  // MIS MEMBERSHIPS (solo AuthGuard)
  // ─────────────────────────────────────────

  @Get('users/me/memberships')
  @UseGuards(AuthGuard)
  findMine(@Request() req) {
    return this.membershipsService.findMine(req.user.id)
  }

  @Post('memberships')
  @UseGuards(AuthGuard)
  requestJoin(@Request() req, @Body() dto: CreateMembershipDto) {
    return this.membershipsService.requestJoin(req.user.id, dto)
  }

  @Post('memberships/:id/accept')
  @UseGuards(AuthGuard)
  accept(@Request() req, @Param('id') id: string) {
    return this.membershipsService.accept(req.user.id, id)
  }

  @Post('memberships/:id/reject')
  @UseGuards(AuthGuard)
  reject(@Request() req, @Param('id') id: string) {
    return this.membershipsService.reject(req.user.id, id)
  }

  @Delete('memberships/:id')
  @UseGuards(AuthGuard)
  leave(@Request() req, @Param('id') id: string) {
    return this.membershipsService.leave(req.user.id, id)
  }

  @Put('memberships/:id')
  @UseGuards(AuthGuard)
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateMembershipDto,
  ) {
    return this.membershipsService.update(req.user.id, id, dto)
  }

  @Post('memberships/:id/roles')
  @UseGuards(AuthGuard)
  addRole(
    @Request() req,
    @Param('id') id: string,
    @Body('role') role: string,
  ) {
    return this.membershipsService.addRole(req.user.id, id, role as any)
  }

  @Delete('memberships/:id/roles/:role')
  @UseGuards(AuthGuard)
  removeRole(
    @Request() req,
    @Param('id') id: string,
    @Param('role') role: string,
  ) {
    return this.membershipsService.removeRole(req.user.id, id, role as any)
  }

  // ─────────────────────────────────────────
  // MIEMBROS DE EQUIPO (AuthGuard + PermissionsGuard)
  // ─────────────────────────────────────────

  @Get('teams/:teamId/members')
  @UseGuards(AuthGuard) // Solo AuthGuard, sin PermissionsGuard
  findByTeam(@Request() req, @Param('teamId') teamId: string) {
    return this.membershipsService.findByTeam(req.user.id, teamId)
  }

  // Guía Lote 9.1: añadir/invitar miembro = member:edit (antes member:create)
  @Post('teams/:teamId/members')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('member', 'edit', { teamIdFrom: { param: 'teamId' } })
  addMember(
    @Request() req,
    @Param('teamId') teamId: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.membershipsService.addMember(req.user.id, teamId, dto)
  }

  @Delete('teams/:teamId/members/:membershipId')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('member', 'delete', { teamIdFrom: { param: 'teamId' } })
  remove(
    @Request() req,
    @Param('teamId') teamId: string,
    @Param('membershipId') membershipId: string,
  ) {
    return this.membershipsService.leave(req.user.id, membershipId)
  }
}