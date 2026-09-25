import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RefreshTokenService } from './refresh-token.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { generateUniqueUsername } from '../user/utils/generate-username'; // ✅ NUEVO

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private refreshTokenService: RefreshTokenService,
  ) {}

  async register(registerDto: RegisterDto) {
    // 1) Buscar si ya existe un User con ese email
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    })

    const hashedPassword = await bcrypt.hash(registerDto.password, 10)

    let user: any

    if (existingUser) {
      // ✅ Si existe y es un fantasma, lo "reclamamos" (no creamos uno nuevo)
      if (existingUser.isGhost) {
        // ✅ NUEVO: si el fantasma no tiene username, se lo generamos ahora
        const finalUsername = existingUser.username
          ? existingUser.username
          : await generateUniqueUsername(
              this.prisma,
              registerDto.name || existingUser.name,
              registerDto.lastName || existingUser.lastName,
              existingUser.id,
            )

        user = await this.prisma.user.update({
          where: { id: existingUser.id },
          data: {
            password: hashedPassword,
            name: registerDto.name || existingUser.name,
            lastName: registerDto.lastName || existingUser.lastName,
            isGhost: false,
            username: finalUsername, // ✅ NUEVO
          },
        })
      } else {
        // Si ya existe un user real con ese email, error
        throw new ConflictException('El usuario ya existe')
      }
    } else {
      // ✅ NUEVO: generar username único para el nuevo user
      const username = await generateUniqueUsername(
        this.prisma,
        registerDto.name,
        registerDto.lastName,
      )

      // ✅ Crear user nuevo
      user = await this.prisma.user.create({
        data: {
          email: registerDto.email,
          password: hashedPassword,
          name: registerDto.name,
          lastName: registerDto.lastName,
          isGhost: false,
          username, // ✅ NUEVO
        },
      })
    }

    // 2) Si viene con código de invitación, usarlo
    if (registerDto.invitationCode) {
      try {
        await this.useInvitationIfPossible(registerDto.invitationCode, user)
      } catch (err: any) {
        // No fallar el registro si la invitación es inválida
        console.warn(
          `⚠️ Invitación ${registerDto.invitationCode} no aplicable: ${err.message}`,
        )
      }
    }

    const tokens = await this.generateTokens(user)

    return {
      user: this.excludePassword(user),
      ...tokens,
    }
  }

  /**
   * Aplica una invitación a un usuario recién registrado.
   * - Valida el código.
   * - Marca la invitación como USED.
   * - Crea el TeamMembership si no existe.
   */
  private async useInvitationIfPossible(
    code: string,
    user: { id: string; email: string | null },
  ) {
    const invitation = await this.prisma.pendingInvitation.findUnique({
      where: { code },
    })

    if (!invitation) {
      throw new Error('Invitación no encontrada')
    }

    if (invitation.status !== 'PENDING') {
      throw new Error('La invitación ya fue usada o revocada')
    }

    if (invitation.expiresAt < new Date()) {
      await this.prisma.pendingInvitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      })
      throw new Error('La invitación ha caducado')
    }

    // ✅ Si la invitación tiene email, debe coincidir con el del usuario
    if (invitation.email && invitation.email !== user.email) {
      throw new Error('El email no coincide con el de la invitación')
    }

    // ✅ Crear el TeamMembership si no existe
    const existingMembership = await this.prisma.teamMembership.findFirst({
      where: {
        userId: user.id,
        teamId: invitation.teamId,
      },
    })

    if (!existingMembership) {
      await this.prisma.teamMembership.create({
        data: {
          userId: user.id,
          teamId: invitation.teamId,
          role: invitation.role || 'PLAYER',
          status: 'ACTIVE',
          invitedById: invitation.invitedById,
        },
      })
    }

    // ✅ Marcar invitación como usada
    await this.prisma.pendingInvitation.update({
      where: { id: invitation.id },
      data: {
        status: 'USED',
        usedAt: new Date(),
        userId: user.id,
      },
    })
  }

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const tokens = await this.generateTokens(user);

    return {
      user: this.excludePassword(user),
      ...tokens,
    };
  }

  async refreshToken(refreshToken: string) {
    const tokenData = await this.refreshTokenService.validateRefreshToken(refreshToken);
    
    await this.refreshTokenService.revokeRefreshToken(refreshToken);
    
    const user = await this.prisma.user.findUnique({
      where: { id: tokenData.userId },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    const tokens = await this.generateTokens(user);
    
    return tokens;
  }

  async logout(userId: string, refreshToken: string) {
    await this.refreshTokenService.revokeRefreshToken(refreshToken);
    return { message: 'Logout exitoso' };
  }

  async logoutAll(userId: string) {
    await this.refreshTokenService.revokeAllUserTokens(userId);
    return { message: 'Todos los dispositivos desconectados' };
  }

  private async generateTokens(user: any) {
    const accessToken = this.jwtService.sign(
      { 
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      { expiresIn: '15m' }
    )

    const refreshToken = await this.refreshTokenService.createRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
    }
  }

  private excludePassword(user: any) {
    const { password, ...result } = user;
    return result;
  }
}