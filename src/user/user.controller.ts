import { Controller, Get, Post, Put, Delete, Body, Param, Request, UseGuards, ForbiddenException } from '@nestjs/common'
import { UserService } from './user.service'
import { AuthGuard } from '../auth/auth.guard'



@Controller('users')
@UseGuards(AuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  // ✅ Solo SUPER_ADMIN: Listar todos los usuarios
  @Get()
  async findAll(@Request() req) {
    // Verificar que es SUPER_ADMIN
    if (req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Solo los super administradores pueden ver todos los usuarios')
    }
    return this.userService.findAll()
  }

  // ✅ Cualquier usuario autenticado: Ver su propio perfil
  @Get('me')
  async getProfile(@Request() req) {
    return this.userService.findOne(req.user.id)
  }

  // ✅ Solo SUPER_ADMIN: Ver un usuario específico
  @Get(':id')
  async findOne(@Request() req, @Param('id') id: string) {
    if (req.user.role !== 'SUPER_ADMIN' && req.user.id !== id) {
      throw new ForbiddenException('No tienes permisos para ver este usuario')
    }
    return this.userService.findOne(id)
  }

  // ✅ Solo SUPER_ADMIN: Cambiar rol global
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

  // ✅ Solo SUPER_ADMIN: Eliminar usuario
  @Delete(':id')
  async remove(@Request() req, @Param('id') id: string) {
    if (req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Solo los super administradores pueden eliminar usuarios')
    }
    return this.userService.remove(id)
  }

  // ✅ Buscar usuario por email (para invitar)
  @Get('search/:email')
  async findByEmail(@Request() req, @Param('email') email: string) {
    return this.userService.findByEmail(email)
  }

  // ✅ NUEVO: Solo SUPER_ADMIN puede crear usuarios
  @Post()
  async create(@Request() req, @Body() createUserDto: { email: string; password: string; name: string; lastName: string; role?: string }) {
    if (req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Solo los super administradores pueden crear usuarios')
    }
    return this.userService.create(createUserDto)
  }
}

