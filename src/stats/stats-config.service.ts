import { BadRequestException, Injectable } from '@nestjs/common'
import { StatsAudienceRole, StatsScope } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import {
  canManageStatsConfig,
  getTeamForViewer,
} from '../common/access'
import {
  getMetricsForSportAndScope,
  getValidMetricKeys,
} from './metric-registry'
import { UpdateStatsConfigDto } from './dto/update-stats-config.dto'

export interface StatsConfigEntry {
  scope: StatsScope
  role: StatsAudienceRole
  metricKey: string
  label: string
  group: string
  visible: boolean
}

export interface StatsConfigResponse {
  team: { id: string; name: string; sport: string }
  entries: StatsConfigEntry[]
}

const ALL_ROLES: StatsAudienceRole[] = [
  'PLAYER',
  'COACH',
  'ASSISTANT',
  'ADMIN_TEAM',
  'VISITOR',
]

const ALL_SCOPES: StatsScope[] = ['MATCH', 'TEAM', 'PLAYER']

@Injectable()
export class StatsConfigService {
  constructor(private prisma: PrismaService) {}

  async getConfig(userId: string, teamId: string): Promise<StatsConfigResponse> {
    const team = await getTeamForViewer(this.prisma, userId, teamId)

    const rows = await this.prisma.statsVisibilityConfig.findMany({
      where: { teamId, sport: team.sport },
    })

    const map = new Map<string, boolean>()
    for (const r of rows) {
      map.set(`${r.scope}|${r.role}|${r.metricKey}`, r.visible)
    }

    const entries: StatsConfigEntry[] = []
    for (const scope of ALL_SCOPES) {
      const metrics = getMetricsForSportAndScope(team.sport, scope)
      if (metrics.length === 0) continue
      for (const role of ALL_ROLES) {
        for (const metric of metrics) {
          const k = `${scope}|${role}|${metric.key}`
          entries.push({
            scope,
            role,
            metricKey: metric.key,
            label: metric.label,
            group: metric.group,
            visible: map.has(k) ? map.get(k)! : true,
          })
        }
      }
    }

    return {
      team: { id: team.id, name: team.name, sport: team.sport },
      entries,
    }
  }

  async updateConfig(
    userId: string,
    teamId: string,
    dto: UpdateStatsConfigDto,
  ): Promise<StatsConfigResponse> {
    const team = await getTeamForViewer(this.prisma, userId, teamId)

    if (!(await canManageStatsConfig(this.prisma, userId, teamId))) {
      throw new BadRequestException(
        'No tienes permisos para modificar la configuración de estadísticas',
      )
    }

    // Validar entradas contra el registry
    for (const e of dto.entries) {
      const valid = getValidMetricKeys(team.sport, e.scope)
      if (!valid.has(e.metricKey)) {
        throw new BadRequestException(
          `Métrica inválida para el scope ${e.scope}: ${e.metricKey}`,
        )
      }
    }

    // 1) Reset opcional (borrar scopes)
    if (dto.resetScopes && dto.resetScopes.length > 0) {
      await this.prisma.statsVisibilityConfig.deleteMany({
        where: {
          teamId,
          sport: team.sport,
          scope: { in: dto.resetScopes },
        },
      })
    }

    // 2) Upserts en paralelo (sin transacción, sin timeout).
    //    Promise.all con chunks para no saturar el pool de Neon.
    const CHUNK = 20
    const upserts = dto.entries.map((e) =>
      this.prisma.statsVisibilityConfig.upsert({
        where: {
          teamId_scope_role_metricKey: {
            teamId,
            scope: e.scope,
            role: e.role,
            metricKey: e.metricKey,
          },
        },
        update: { visible: e.visible, sport: team.sport },
        create: {
          teamId,
          sport: team.sport,
          scope: e.scope,
          role: e.role,
          metricKey: e.metricKey,
          visible: e.visible,
        },
      }),
    )

    for (let i = 0; i < upserts.length; i += CHUNK) {
      const batch = upserts.slice(i, i + CHUNK)
      await Promise.all(batch)
    }

    return this.getConfig(userId, teamId)
  }
}