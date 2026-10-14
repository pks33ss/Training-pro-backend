// backend/src/permissions/permissions.controller.ts
// Lote 8.3 — Endpoint de permisos efectivos del usuario actual.

import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { PrismaService } from '../prisma/prisma.service'
import { PermissionsService } from './permissions.service'
import { PERMISSION_RESOURCES, PERMISSION_ACTIONS } from './permissions.constants'
import { keyOf } from './permissions.types'

@Controller('clubs/:clubId/permissions')
@UseGuards(AuthGuard)
export class PermissionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get('me')
  async me(@Request() req, @Param('clubId') clubId: string) {
    const perms = await this.permissionsService.resolve(
      this.prisma,
      req.user.id,
      clubId,
    )

    // Serializar Sets a arrays para JSON.
    const clubWide: string[] = Array.from(perms.clubWide)
    const perTeam: Record<string, string[]> = {}
    for (const [teamId, set] of perms.perTeam.entries()) {
      perTeam[teamId] = Array.from(set)
    }

    // Vista "matriz completa" con booleanos, cómoda para el frontend.
    const matrix: Record<string, Record<string, boolean>> = {}
    for (const r of PERMISSION_RESOURCES) {
      matrix[r] = {}
      for (const a of PERMISSION_ACTIONS) {
        matrix[r][a] = perms.clubWide.has(keyOf(r, a))
      }
    }

    return {
      clubId,
      userId: req.user.id,
      clubWide,
      perTeam,
      matrix,
    }
  }
}