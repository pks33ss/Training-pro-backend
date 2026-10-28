import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class DemoReadonlyGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Si el usuario es el demo, y el método no es GET (lectura), bloqueamos
    if (request.user && request.user.email === 'demo@joinsportapp.com') {
      const method = request.method;
      if (method !== 'GET') {
        throw new ForbiddenException('El usuario de demostración es de solo lectura. Regístrate para probar todas las funciones.');
      }
    }
    
    return true;
  }
}