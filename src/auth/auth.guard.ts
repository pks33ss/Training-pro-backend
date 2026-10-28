import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // 🛡️ 1. Permitir rutas públicas (login, register, google, health)
    const publicRoutes = ['/auth/login', '/auth/register', '/auth/google', '/health'];
    if (publicRoutes.some(route => request.url.startsWith(route))) {
      return true;
    }

    // 2. Intentar extraer del header (normal)
    let token = this.extractTokenFromHeader(request);
    
    // 3. Si no hay header, intentar extraer de la URL (para SSE)
    if (!token && request.query.token) {
      token = request.query.token as string;
    }
    
    if (!token) {
      throw new UnauthorizedException('Token no proporcionado');
    }
    
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET,
      });
      
      // ✅ Agregar el usuario al request
      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };

      // 🛡️ 4. CANDADO DE SOLO LECTURA PARA LA DEMO
      if (request.user.email === 'demo@joinsportapp.com') {
        const method = request.method;
        // Si no es una petición GET (lectura), bloqueamos
        if (method !== 'GET') {
          throw new ForbiddenException(
            'El usuario de demostración es de solo lectura. Regístrate para probar todas las funciones.',
          );
        }
      }
      
    } catch (error) {
      // Si es nuestro ForbiddenException, lo dejamos pasar tal cual
      if (error instanceof ForbiddenException) {
        throw error;
      }
      
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token expirado');
      }
      throw new UnauthorizedException('Token inválido');
    }
    
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}