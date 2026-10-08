import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * Guard que solo permite el paso a usuarios con `role === 'SUPER_ADMIN'`.
 * Asume que AuthGuard ya ha inyectado `req.user` (con `id` y `role`).
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user || user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException({
        code: 'NOT_SUPER_ADMIN',
        message: 'Solo los Super Admins pueden acceder a este recurso',
      });
    }

    return true;
  }
}