// backend/src/match-import/match-import.service.ts

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { assertCanManageLiveStats, canViewTeam } from '../common/access'
import { ImportFromSessionDto } from './dto/import-from-session.dto'

@Injectable()
export class MatchImportService {
  constructor(private prisma: PrismaService) {}

  // ─────────────────────────────────────────────
  // CANDIDATOS
  // ─────────────────────────────────────────────

  async getCandidates(userId: string, matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, teamId: true },
    })
    if (!match) throw new NotFoundException('Partido no encontrado')
    if (!(await canViewTeam(this.prisma, userId, match.teamId))) {
      throw new ForbiddenException('No tienes acceso a este equipo')
    }

    const sessions = await this.prisma.statSession.findMany({
      where: {
        teamId: match.teamId,
        closedAt: { not: null },
      },
      orderBy: [{ statDate: 'desc' }, { closedAt: 'desc' }],
      include: {
        _count: { select: { playerStats: true, opponentPlayers: true } },
      },
    })

    const matchHasStats =
      (await this.prisma.matchPlayerStats.count({
        where: { matchId },
      })) > 0

    return {
      matchHasStats,
      sessions: sessions.map((s) => ({
        id: s.id,
        type: s.type,
        label: s.label,
        statDate: s.statDate.toISOString(),
        opponent: s.opponent,
        teamScore: s.teamScore,
        opponentScore: s.opponentScore,
        playerCount: s._count.playerStats,
        opponentPlayerCount: s._count.opponentPlayers,
        closedAt: s.closedAt?.toISOString() ?? null,
      })),
    }
  }

  // ─────────────────────────────────────────────
  // IMPORTAR
  // ─────────────────────────────────────────────

  async importFromSession(
    userId: string,
    matchId: string,
    dto: ImportFromSessionDto,
  ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, teamId: true },
    })
    if (!match) throw new NotFoundException('Partido no encontrado')
    await assertCanManageLiveStats(this.prisma, userId, match.teamId)

    const session = await this.prisma.statSession.findUnique({
      where: { id: dto.statSessionId },
    })
    if (!session) throw new NotFoundException('Sesión no encontrada')
    if (session.teamId !== match.teamId) {
      throw new BadRequestException(
        'La sesión no pertenece al mismo equipo que el partido',
      )
    }
    if (!session.closedAt) {
      throw new BadRequestException(
        'La sesión no está cerrada. Ciérrala antes de importar.',
      )
    }

    const existingCount = await this.prisma.matchPlayerStats.count({
      where: { matchId },
    })
    if (existingCount > 0 && !dto.overwrite) {
      throw new ConflictException({
        code: 'MATCH_ALREADY_HAS_STATS',
        message:
          'Este partido ya tiene estadísticas. Confirma para sobreescribir.',
        canOverwrite: true,
      })
    }

    const [sessionPlayerStats, sessionOpponentPlayers] = await Promise.all([
      this.prisma.matchPlayerStats.findMany({
        where: { statSessionId: session.id },
      }),
      this.prisma.opponentPlayer.findMany({
        where: { statSessionId: session.id },
        include: { stats: true },
      }),
    ])

    await this.prisma.$transaction(async (tx) => {
      if (existingCount > 0) {
        await tx.matchPlayerStats.deleteMany({ where: { matchId } })
        await tx.matchOpponentPlayer.deleteMany({ where: { matchId } })
      }

      for (const ps of sessionPlayerStats) {
        await tx.matchPlayerStats.upsert({
          where: {
            matchId_userId: { matchId, userId: ps.userId },
          },
          update: {
            minutes: ps.minutes,
            seconds: ps.seconds,
            points: ps.points,
            rebounds: ps.rebounds,
            reboundsOff: ps.reboundsOff,
            reboundsDef: ps.reboundsDef,
            assists: ps.assists,
            steals: ps.steals,
            blocks: ps.blocks,
            turnovers: ps.turnovers,
            fouls: ps.fouls,
            fieldGoalsMade: ps.fieldGoalsMade,
            fieldGoalsAttempted: ps.fieldGoalsAttempted,
            threePointersMade: ps.threePointersMade,
            threePointersAttempted: ps.threePointersAttempted,
            freeThrowsMade: ps.freeThrowsMade,
            freeThrowsAttempted: ps.freeThrowsAttempted,
            blocksAgainst: ps.blocksAgainst,
            foulsDrawn: ps.foulsDrawn,
            plusMinus: ps.plusMinus,
          },
          create: {
            matchId,
            userId: ps.userId,
            statSessionId: null,
            minutes: ps.minutes,
            seconds: ps.seconds,
            points: ps.points,
            rebounds: ps.rebounds,
            reboundsOff: ps.reboundsOff,
            reboundsDef: ps.reboundsDef,
            assists: ps.assists,
            steals: ps.steals,
            blocks: ps.blocks,
            turnovers: ps.turnovers,
            fouls: ps.fouls,
            fieldGoalsMade: ps.fieldGoalsMade,
            fieldGoalsAttempted: ps.fieldGoalsAttempted,
            threePointersMade: ps.threePointersMade,
            threePointersAttempted: ps.threePointersAttempted,
            freeThrowsMade: ps.freeThrowsMade,
            freeThrowsAttempted: ps.freeThrowsAttempted,
            blocksAgainst: ps.blocksAgainst,
            foulsDrawn: ps.foulsDrawn,
            plusMinus: ps.plusMinus,
          },
        })
      }

      for (const op of sessionOpponentPlayers) {
        const mop = await tx.matchOpponentPlayer.create({
          data: {
            matchId,
            userId: op.userId,
            number: op.number,
            name: op.name,
            position: op.position,
          },
        })
        const st = op.stats
        await tx.matchOpponentPlayerStats.create({
          data: {
            matchOpponentPlayerId: mop.id,
            minutes: st?.minutes ?? null,
            seconds: st?.seconds ?? null,
            points: st?.points ?? 0,
            rebounds: st?.rebounds ?? 0,
            reboundsOff: st?.reboundsOff ?? 0,
            reboundsDef: st?.reboundsDef ?? 0,
            assists: st?.assists ?? 0,
            steals: st?.steals ?? 0,
            blocks: st?.blocks ?? 0,
            turnovers: st?.turnovers ?? 0,
            fouls: st?.fouls ?? 0,
            fieldGoalsMade: st?.fieldGoalsMade ?? 0,
            fieldGoalsAttempted: st?.fieldGoalsAttempted ?? 0,
            threePointersMade: st?.threePointersMade ?? 0,
            threePointersAttempted: st?.threePointersAttempted ?? 0,
            freeThrowsMade: st?.freeThrowsMade ?? 0,
            freeThrowsAttempted: st?.freeThrowsAttempted ?? 0,
            blocksAgainst: st?.blocksAgainst ?? 0,
            foulsDrawn: st?.foulsDrawn ?? 0,
            plusMinus: st?.plusMinus ?? 0,
          },
        })
      }
    })

    // NOTA: ya NO recalculamos TeamOpponentPlayer aquí.
    // Se hace al cerrar el partido (POST /matches/:id/close).

    return { ok: true }
  }
}