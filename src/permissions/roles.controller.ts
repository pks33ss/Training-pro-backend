// backend/src/permissions/roles.controller.ts
// Lote 8.3 — Endpoints de gestión de roles y permisos.
// Prefijo: /clubs/:clubId/roles
//
// NOTA: usa el AuthGuard existente (mismo patrón que el resto de
// controllers). La autorización fina la hace RolesService (isClubAdmin).

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { RolesService } from './roles.service'
import { CreateRoleDto } from './dto/create-role.dto'
import { UpdateRoleDto } from './dto/update-role.dto'
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto'
import { PreviewImpactDto } from './dto/preview-impact.dto'

@Controller('clubs/:clubId/roles')
@UseGuards(AuthGuard)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  list(@Request() req, @Param('clubId') clubId: string) {
    return this.roles.listRoles(req.user.id, clubId)
  }

  @Get(':roleId')
  getOne(
    @Request() req,
    @Param('clubId') clubId: string,
    @Param('roleId') roleId: string,
  ) {
    return this.roles.getRole(req.user.id, clubId, roleId)
  }

  @Post()
  create(
    @Request() req,
    @Param('clubId') clubId: string,
    @Body() dto: CreateRoleDto,
  ) {
    return this.roles.createRole(req.user.id, clubId, dto)
  }

  @Put(':roleId')
  update(
    @Request() req,
    @Param('clubId') clubId: string,
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.roles.updateRole(req.user.id, clubId, roleId, dto)
  }

  @Delete(':roleId')
  remove(
    @Request() req,
    @Param('clubId') clubId: string,
    @Param('roleId') roleId: string,
  ) {
    return this.roles.deleteRole(req.user.id, clubId, roleId)
  }

  @Put(':roleId/permissions')
  setPermissions(
    @Request() req,
    @Param('clubId') clubId: string,
    @Param('roleId') roleId: string,
    @Body() dto: SetRolePermissionsDto,
  ) {
    return this.roles.setPermissions(req.user.id, clubId, roleId, dto)
  }

  @Post(':roleId/preview-impact')
  previewImpact(
    @Request() req,
    @Param('clubId') clubId: string,
    @Param('roleId') roleId: string,
    @Body() dto: PreviewImpactDto,
  ) {
    return this.roles.previewImpact(req.user.id, clubId, roleId, dto)
  }
}