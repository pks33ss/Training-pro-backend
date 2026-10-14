// backend/src/permissions/permissions.guard.ts
// Lote 8.4 — Guard de permisos.

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PrismaService } from '../prisma/prisma.service'
import { PermissionsService } from './permissions.service'
import {
  PERMISSION_META_KEY,
  type IdSource,
  type PermissionMeta,
} from './require-permission.decorator'

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<PermissionMeta | undefined>(
      PERMISSION_META_KEY,
      [context.getHandler(), context.getClass()],
    )
    if (!meta) return true

    const req = context.switchToHttp().getRequest()
    const userId: string | undefined = req.user?.id
    if (!userId) {
      throw new ForbiddenException('No autenticado')
    }

    const { resource, action, clubIdFrom, teamIdFrom } = meta
    const params = req.params ?? {}
    const body = req.body ?? {}
    const query = req.query ?? {}

    const teamId = teamIdFrom
      ? this.resolveSource(teamIdFrom, params, body, query)
      : undefined

    let clubId = this.resolveSource(clubIdFrom, params, body, query)

    // Si no tenemos clubId pero sí teamId, lo resolvemos del team.
    if (!clubId && teamId) {
      const team = await this.prisma.team.findUnique({
        where: { id: teamId },
        select: { clubId: true },
      })
      clubId = team?.clubId
    }

    if (!clubId) {
      throw new ForbiddenException(
        'No se pudo resolver el club para la comprobación de permisos',
      )
    }

    const ok = await this.permissionsService.can(
      this.prisma,
      userId,
      resource,
      action,
      { clubId, teamId: teamId ?? undefined },
    )

    if (!ok) {
      throw new ForbiddenException(
        `No tienes permisos para ${resource}:${action}`,
      )
    }

    return true
  }

  private resolveSource(
    src: IdSource | undefined,
    params: Record<string, any>,
    body: Record<string, any>,
    query: Record<string, any>,
  ): string | undefined {
    if (!src) return undefined
    if (typeof src === 'string') return params[src] as string | undefined
    if ('param' in src) return params[src.param] as string | undefined
    if ('body' in src) return body[src.body] as string | undefined
    if ('query' in src) return query[src.query] as string | undefined
    return undefined
  }
}