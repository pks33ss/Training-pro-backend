import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RefreshTokenService } from './refresh-token.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { generateUniqueUsername } from '../user/utils/generate-username';
import { ensureClubMemberForTeam } from '../club/utils/ensure-club-member';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private refreshTokenService: RefreshTokenService,
  ) {}

  async register(registerDto: RegisterDto) {
    const hashedPassword = await bcrypt.hash(registerDto.password, 10)

    let user: any
    let invitation: any = null

    // ─────────────────────────────────────────────
    // 1) Buscar invitación ANTES de tocar User
    // ─────────────────────────────────────────────
    if (registerDto.invitationCode) {
      invitation = await this.prisma.pendingInvitation.findUnique({
        where: { code: registerDto.invitationCode },
        include: {
          user: {
            select: {
              id: true,
              isGhost: true,
              deletedAt: true,
              username: true,
              name: true,
              lastName: true,
            },
          },
        },
      })

      if (invitation && invitation.status !== 'PENDING') invitation = null

      if (invitation && invitation.expiresAt < new Date()) {
        await this.prisma.pendingInvitation.update({
          where: { id: invitation.id },
          data: { status: 'EXPIRED' },
        })
        invitation = null
      }

      if (invitation?.user?.deletedAt) invitation = null
    }

    // ─────────────────────────────────────────────
    // 2) Caso A: invitación apunta a FANTASMA → reclamarlo
    // ─────────────────────────────────────────────
    if (invitation?.user?.isGhost) {
      const ghost = invitation.user

      const finalUsername = ghost.username
        ? ghost.username
        : await generateUniqueUsername(
            this.prisma,
            registerDto.name || ghost.name,
            registerDto.lastName || ghost.lastName,
            ghost.id,
          )

      user = await this.prisma.user.update({
        where: { id: ghost.id },
        data: {
          email: registerDto.email,
          password: hashedPassword,
          name: registerDto.name || ghost.name,
          lastName: registerDto.lastName || ghost.lastName,
          isGhost: false,
          username: finalUsername,
        },
      })
    }
    // ─────────────────────────────────────────────
    // 3) Caso B: buscar por email (comportamiento actual)
    // ─────────────────────────────────────────────
    else {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: registerDto.email },
      })

      if (existingUser?.isGhost) {
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
            username: finalUsername,
          },
        })
      } else if (existingUser) {
        throw new ConflictException('El usuario ya existe')
      } else {
        const username = await generateUniqueUsername(
          this.prisma,
          registerDto.name,
          registerDto.lastName,
        )

        user = await this.prisma.user.create({
          data: {
            email: registerDto.email,
            password: hashedPassword,
            name: registerDto.name,
            lastName: registerDto.lastName,
            isGhost: false,
            username,
          },
        })
      }
    }

    // ─────────────────────────────────────────────
    // 4) Aplicar invitación (idempotente)
    // ─────────────────────────────────────────────
    if (invitation) {
      try {
        await this.applyInvitation(invitation, user)
      } catch (err: any) {
        console.warn(
          `⚠️ Invitación ${invitation.code} no aplicable: ${err.message}`,
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
   * Aplica una invitación a un usuario recién registrado (o recién reclamado).
   * Idempotente: si el membership ya existía (caso fantasma reclamado), no duplica.
   */
  private async applyInvitation(
    invitation: {
      id: string
      code: string
      teamId: string
      role: any
      invitedById: string
      email: string | null
    },
    user: { id: string; email: string | null },
  ) {
    // 1) Validar email SOLO si la invitación lo trae y NO coincide
    if (invitation.email && invitation.email !== user.email) {
      throw new Error('El email no coincide con el de la invitación')
    }

    // 2) Upsert membership (idempotente)
    const membership = await this.prisma.teamMembership.upsert({
      where: {
        userId_teamId: { userId: user.id, teamId: invitation.teamId },
      },
      create: {
        userId: user.id,
        teamId: invitation.teamId,
        status: 'ACTIVE',
        invitedById: invitation.invitedById,
        roles: { create: [{ role: invitation.role }] },
      },
      update: {
        status: 'ACTIVE',
        leftAt: null,
      },
      include: { roles: true },
    })

    // 3) Asegurar rol
    if (!membership.roles.some((r) => r.role === invitation.role)) {
      await this.prisma.membershipRole.upsert({
        where: {
          membershipId_role: {
            membershipId: membership.id,
            role: invitation.role,
          },
        },
        create: {
          membershipId: membership.id,
          role: invitation.role,
        },
        update: {},
      })
    }

    // 4) Asegurar ClubMember
    await ensureClubMemberForTeam(this.prisma, user.id, invitation.teamId)

    // 5) Marcar USED
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