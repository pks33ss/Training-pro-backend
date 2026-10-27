import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // 1. Intentar extraer del header (normal)
    let token = this.extractTokenFromHeader(request);
    
    // 2. Si no hay header, intentar extraer de la URL (para SSE)
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
      
      // ✅ IMPORTANTE: Agregar el usuario al request
      request.user = {
        id: payload.sub,  // <-- El 'sub' es el userId que pusimos en el JWT
        email: payload.email,
        role: payload.role,
      };
      
    } catch (error) {
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