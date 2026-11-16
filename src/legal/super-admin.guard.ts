import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'

/**
 * Guard que verifica que el usuario autenticado sea SUPER_ADMIN.
 * Se usa SOLO en el controller de Legal (no modifica auth.guard.ts).
 * Requiere que AuthGuard ya haya corrido antes y haya populado request.user.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const user = request.user

    if (!user) {
      throw new UnauthorizedException('Usuario no autenticado')
    }

    if (user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Solo el super administrador puede modificar la configuración legal',
      )
    }

    return true
  }
}