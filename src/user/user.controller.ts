import { Controller, Get, Post, Put, Delete, Body, Param, Query, Request, UseGuards, ForbiddenException } from '@nestjs/common'
import { UserService } from './user.service'
import { AuthGuard } from '../auth/auth.guard'
import { CreateGhostDto } from './dto/create-ghost.dto'
import { UpdatePlayerProfileDto } from './dto/update-player-profile.dto'
import { CreateInjuryDto } from './dto/create-injury.dto'
import { UpdateInjuryDto } from './dto/update-injury.dto'
import { UpdateEmailOptOutDto } from './dto/update-email-optout.dto'

@Controller('users')
@UseGuards(AuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  // ============================================
  // PERFIL DEL USUARIO (deben ir ANTES de :id)
  // ============================================

  @Get('profile/me')
  getProfile(@Request() req) {
    return this.userService.getProfile(req.user.id)
  }

  @Put('profile/me')
  updateProfile(@Request() req, @Body() data: any) {
    return this.userService.updateProfile(req.user.id, data)
  }

  @Put('profile/change-password')
  changePassword(@Request() req, @Body() data: any) {
    return this.userService.changePassword(
      req.user.id,
      data.currentPassword,
      data.newPassword,
    )
  }

  @Get('me')
  getMe(@Request() req) {
    return this.userService.getMe(req.user.id)
  }

  @Put('me')
  updateMe(@Request() req, @Body() data: any) {
    return this.userService.updateMe(req.user.id, data)
  }

  // ✅ NUEVO — Preferencia de opt-out del propio usuario
  @Put('me/email-optout')
  updateEmailOptOut(@Request() req, @Body() dto: UpdateEmailOptOutDto) {
    return this.userService.updateEmailOptOut(req.user.id, dto.optOut)
  }

  @Delete('me')
  deleteMe(@Request() req) {
    return this.userService.deleteMe(req.user.id)
  }

  @Get('search')
  search(@Request() req, @Query('q') q: string) {
    return this.userService.searchUsers(req.user.id, q)
  }

  @Get('by-username/:username')
  findByUsername(@Param('username') username: string) {
    return this.userService.findByUsername(username)
  }

  @Get('lookup')
  lookup(
    @Request() req,
    @Query('email') email?: string,
    @Query('username') username?: string,
  ) {
    return this.userService.lookupUserForInvite(req.user.id, { email, username })
  }

  @Post('ghost')
  createGhost(@Request() req, @Body() dto: CreateGhostDto) {
    return this.userService.createGhost(req.user.id, dto)
  }

  // ============================================
  // GESTIÓN DE USUARIOS (solo SUPER_ADMIN)
  // ============================================

  @Get()
async findAll(@Request() req, @Query('includeDeleted') includeDeleted?: string) {
  if (req.user.role !== 'SUPER_ADMIN') {
    throw new ForbiddenException('Solo los super administradores pueden ver todos los usuarios')
  }
  return this.userService.findAll(includeDeleted === 'true')
}
  // ============================================
  // PLAYER PROFILE + INJURIES (Fase 4)
  // ============================================

  @Get(':userId/player-profile')
  getPlayerProfile(@Request() req, @Param('userId') userId: string) {
    return this.userService.getPlayerProfile(req.user.id, userId)
  }

  @Put(':userId/player-profile')
  updatePlayerProfile(
    @Request() req,
    @Param('userId') userId: string,
    @Body() dto: UpdatePlayerProfileDto,
  ) {
    return this.userService.updatePlayerProfile(req.user.id, userId, dto)
  }

  @Get(':userId/injuries')
  listInjuries(@Request() req, @Param('userId') userId: string) {
    return this.userService.listInjuries(req.user.id, userId)
  }

  @Post(':userId/injuries')
  createInjury(
    @Request() req,
    @Param('userId') userId: string,
    @Body() dto: CreateInjuryDto,
  ) {
    return this.userService.createInjury(req.user.id, userId, dto)
  }

  @Put(':userId/injuries/:injuryId')
  updateInjury(
    @Request() req,
    @Param('userId') userId: string,
    @Param('injuryId') injuryId: string,
    @Body() dto: UpdateInjuryDto,
  ) {
    return this.userService.updateInjury(req.user.id, userId, injuryId, dto)
  }

  @Delete(':userId/injuries/:injuryId')
  deleteInjury(
    @Request() req,
    @Param('userId') userId: string,
    @Param('injuryId') injuryId: string,
  ) {
    return this.userService.deleteInjury(req.user.id, userId, injuryId)
  }
    @Get(':userId/permissions')
  getUserPermissions(@Request() req, @Param('userId') userId: string) {
    return this.userService.getUserPermissions(req.user.id, userId)
  }
  @Get(':id')
  async findOne(@Request() req, @Param('id') id: string) {
    if (req.user.role !== 'SUPER_ADMIN' && req.user.id !== id) {
      throw new ForbiddenException('No tienes permisos para ver este usuario')
    }
    return this.userService.findOne(id)
  }

  @Post()
  async create(@Request() req, @Body() createUserDto: { email: string; password: string; name: string; lastName: string; role?: string }) {
    if (req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Solo los super administradores pueden crear usuarios')
    }
    return this.userService.create(createUserDto)
  }

  @Put(':id/role')
  async updateRole(
    @Request() req,
    @Param('id') id: string,
    @Body('role') role: string,
  ) {
    if (req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Solo los super administradores pueden cambiar roles')
    }
    return this.userService.updateRole(id, role)
  }

  @Put(':id/ghost-profile')
  async updateGhostProfile(
    @Request() req,
    @Param('id') id: string,
    @Body() data: {
      name?: string
      lastName?: string
      phone?: string | null
      email?: string | null
      bio?: string | null
    },
  ) {
    return this.userService.updateGhostProfile(req.user.id, id, data)
  }

  @Delete(':id')
  async remove(
    @Request() req,
    @Param('id') id: string,
    @Query('mode') mode?: string,
  ) {
    if (req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Solo los super administradores pueden eliminar usuarios')
    }

    const resolvedMode = mode === 'hard' ? 'hard' : 'soft'

    if (resolvedMode === 'hard') {
      return this.userService.hardDelete(id, req.user.id)
    }

    return this.userService.softDelete(id, req.user.id)
  }

  @Post(':id/reset-password')
  async resetPassword(
    @Request() req,
    @Param('id') id: string,
    @Body('newPassword') newPassword: string,
  ) {
    if (req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Solo los super administradores pueden resetear contraseñas')
    }

    if (!newPassword || newPassword.length < 6) {
      throw new ForbiddenException('La contraseña debe tener al menos 6 caracteres')
    }

    return this.userService.resetPassword(id, newPassword)
  }
}