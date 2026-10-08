import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RefreshTokenService } from './refresh-token.service';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { generateUniqueUsername } from '../user/utils/generate-username';
import { ensureClubMemberForTeam } from '../club/utils/ensure-club-member';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private refreshTokenService: RefreshTokenService,
    private mailService: MailService,
  ) {}

  async register(registerDto: RegisterDto) {
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    let user: any;
    let invitation: any = null;
    let wasExistingGhost = false;

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
      });

      if (invitation && invitation.status !== 'PENDING') invitation = null;

      if (invitation && invitation.expiresAt < new Date()) {
        await this.prisma.pendingInvitation.update({
          where: { id: invitation.id },
          data: { status: 'EXPIRED' },
        });
        invitation = null;
      }

      if (invitation?.user?.deletedAt) invitation = null;
    }

    if (invitation?.user?.isGhost) {
      const ghost = invitation.user;
      wasExistingGhost = true;

      const finalUsername = ghost.username
        ? ghost.username
        : await generateUniqueUsername(
            this.prisma,
            registerDto.name || ghost.name,
            registerDto.lastName || ghost.lastName,
            ghost.id,
          );

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
      });
    } else {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: registerDto.email },
      });

      if (existingUser?.isGhost) {
        wasExistingGhost = true;
        const finalUsername = existingUser.username
          ? existingUser.username
          : await generateUniqueUsername(
              this.prisma,
              registerDto.name || existingUser.name,
              registerDto.lastName || existingUser.lastName,
              existingUser.id,
            );

        user = await this.prisma.user.update({
          where: { id: existingUser.id },
          data: {
            password: hashedPassword,
            name: registerDto.name || existingUser.name,
            lastName: registerDto.lastName || existingUser.lastName,
            isGhost: false,
            username: finalUsername,
          },
        });
      } else if (existingUser) {
        throw new ConflictException('El usuario ya existe');
      } else {
        const username = await generateUniqueUsername(
          this.prisma,
          registerDto.name,
          registerDto.lastName,
        );

        user = await this.prisma.user.create({
          data: {
            email: registerDto.email,
            password: hashedPassword,
            name: registerDto.name,
            lastName: registerDto.lastName,
            isGhost: false,
            username,
          },
        });
      }
    }

    if (invitation) {
      try {
        await this.applyInvitation(invitation, user);
      } catch (err: any) {
        console.warn(
          `⚠️ Invitación ${invitation.code} no aplicable: ${err.message}`,
        );
      }
    }

    // ✅ Notificación admin (no bloquea la respuesta si falla)
    this.mailService
      .sendAdminNotification({
        eventTitle: 'Nuevo usuario registrado',
        icon: '🆕',
        fields: [
          { label: 'Nombre', value: `${user.name} ${user.lastName}` },
          { label: 'Email', value: user.email ?? '(sin email)' },
          { label: 'Username', value: user.username ?? '(pendiente)' },
          ...(wasExistingGhost
            ? [{ label: 'Origen', value: 'Antiguo jugador sin cuenta (ghost)' }]
            : [{ label: 'Origen', value: 'Registro público' }]),
          ...(invitation
            ? [{ label: 'Invitación', value: invitation.code }]
            : []),
        ],
        note: wasExistingGhost
          ? 'Este usuario existía como jugador sin cuenta y se ha registrado.'
          : undefined,
      })
      .catch((err) =>
        console.error('Error notificando registro de usuario:', err),
      );

    const tokens = await this.generateTokens(user);

    return {
      user: this.excludePassword(user),
      ...tokens,
    };
  }

  private async applyInvitation(
    invitation: {
      id: string;
      code: string;
      teamId: string;
      role: any;
      invitedById: string;
      email: string | null;
    },
    user: { id: string; email: string | null },
  ) {
    if (invitation.email && invitation.email !== user.email) {
      throw new Error('El email no coincide con el de la invitación');
    }

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
    });

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
      });
    }

    await ensureClubMemberForTeam(this.prisma, user.id, invitation.teamId);

    await this.prisma.pendingInvitation.update({
      where: { id: invitation.id },
      data: {
        status: 'USED',
        usedAt: new Date(),
        userId: user.id,
      },
    });
  }

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (user.deletedAt) {
      throw new UnauthorizedException('Esta cuenta ha sido eliminada');
    }

    if (!user.password) {
      throw new UnauthorizedException(
        'Esta cuenta usa inicio de sesión con Google. Por favor, inicia sesión con Google.',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );
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
    const tokenData =
      await this.refreshTokenService.validateRefreshToken(refreshToken);

    await this.refreshTokenService.revokeRefreshToken(refreshToken);

    const user = await this.prisma.user.findUnique({
      where: { id: tokenData.userId },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    if (user.deletedAt) {
      throw new UnauthorizedException('Esta cuenta ha sido eliminada');
    }

    const tokens = await this.generateTokens(user);

    return tokens;
  }

  async loginWithGoogle(idToken: string) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new UnauthorizedException(
        'Google login no está configurado en el servidor',
      );
    }

    const client = new OAuth2Client(clientId);

    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch (err) {
      console.error('Google verifyIdToken error:', err);
      throw new UnauthorizedException('Token de Google inválido o expirado');
    }

    if (!payload || !payload.email) {
      throw new UnauthorizedException('No se pudo obtener el email de Google');
    }

    if (!payload.email_verified) {
      throw new UnauthorizedException('El email de Google no está verificado');
    }

    const email = payload.email;
    const googleName = payload.given_name ?? payload.name ?? '';
    const googleLastName = payload.family_name ?? '';
    const googleAvatar = payload.picture ?? null;

    let user = await this.prisma.user.findUnique({
      where: { email },
    });

    let isNewGoogleUser = false;

    if (user) {
      if (user.deletedAt) {
        throw new UnauthorizedException('Esta cuenta ha sido eliminada');
      }

      if (!user.avatar && googleAvatar) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { avatar: googleAvatar },
        });
      }
    } else {
      const username = await generateUniqueUsername(
        this.prisma,
        googleName,
        googleLastName,
      );

      user = await this.prisma.user.create({
        data: {
          email,
          password: null,
          name: googleName || email.split('@')[0],
          lastName: googleLastName,
          avatar: googleAvatar,
          username,
          isGhost: false,
          role: 'USER',
        },
      });

      isNewGoogleUser = true;
    }

    // ✅ Notificación admin solo si es usuario nuevo
    if (isNewGoogleUser) {
      this.mailService
        .sendAdminNotification({
          eventTitle: 'Nuevo usuario registrado (Google)',
          icon: '🆕',
          fields: [
            { label: 'Nombre', value: `${user.name} ${user.lastName}` },
            { label: 'Email', value: user.email ?? '(sin email)' },
            { label: 'Username', value: user.username ?? '(pendiente)' },
            { label: 'Origen', value: 'Registro con Google' },
          ],
        })
        .catch((err) =>
          console.error('Error notificando registro Google:', err),
        );
    }

    const tokens = await this.generateTokens(user);

    return {
      user: this.excludePassword(user),
      ...tokens,
    };
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
      { expiresIn: '15m' },
    );

    const refreshToken = await this.refreshTokenService.createRefreshToken(
      user.id,
    );

    return {
      accessToken,
      refreshToken,
    };
  }

  private excludePassword(user: any) {
    const { password, ...result } = user;
    return result;
  }
}