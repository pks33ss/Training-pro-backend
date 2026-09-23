import { Controller, Get, Post, Put, Delete, Body, Param, Query, Request, UseGuards, ForbiddenException } from '@nestjs/common'
import { UserService } from './user.service'
import { AuthGuard } from '../auth/auth.guard'

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
  // ============================================
  // NUEVOS ENDPOINTS (Fase 3 - User refactor)
  // ============================================

  @Get('me')
  getMe(@Request() req) {
    return this.userService.getMe(req.user.id)
  }

  @Put('me')
  updateMe(@Request() req, @Body() data: any) {
    return this.userService.updateMe(req.user.id, data)
  }

  @Get('search')
  search(@Request() req, @Query('q') q: string) {
    return this.userService.searchUsers(req.user.id, q)
  }

  @Get('by-username/:username')
  findByUsername(@Param('username') username: string) {
    return this.userService.findByUsername(username)
  }
  // ============================================
  // GESTIÓN DE USUARIOS (solo SUPER_ADMIN)
  // ============================================

  @Get()
  async findAll(@Request() req) {
    if (req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Solo los super administradores pueden ver todos los usuarios')
    }
    return this.userService.findAll()
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

  @Delete(':id')
  async remove(@Request() req, @Param('id') id: string) {
    if (req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Solo los super administradores pueden eliminar usuarios')
    }
    return this.userService.remove(id)
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