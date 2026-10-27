// backend/src/match/dto/update-stats.dto.ts

import { IsInt, IsOptional, Max, Min } from 'class-validator'

/**
 * Editar stats de un jugador dentro de un Match.
 *
 * NOTA: `points`, `fieldGoalsMade` y `fieldGoalsAttempted` se aceptan por
 * compatibilidad con clientes antiguos, pero el backend los IGNORA y los
 * recalcula a partir de 2P, 3P y TL:
 *   PTS = 2*2PM + 3*3PM + FTM
 *   FGM = 2PM + 3PM
 *   FGA = 2PA + 3PA
 */
export class UpdateStatsDto {
  @IsInt()
  @Min(0)
  @IsOptional()
  minutes?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(59)
  seconds?: number | null

  @IsInt()
  @Min(0)
  @IsOptional()
  rebounds?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  assists?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  steals?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  blocks?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  turnovers?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  fouls?: number

  // ─── Tiros de 2 (FUENTE DE VERDAD) ──────────────────────────
  @IsInt()
  @Min(0)
  @IsOptional()
  twoPointersMade?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  twoPointersAttempted?: number

  // ─── Tiros de 3 (FUENTE DE VERDAD) ──────────────────────────
  @IsInt()
  @Min(0)
  @IsOptional()
  threePointersMade?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  threePointersAttempted?: number

  // ─── Tiros libres (FUENTE DE VERDAD) ────────────────────────
  @IsInt()
  @Min(0)
  @IsOptional()
  freeThrowsMade?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  freeThrowsAttempted?: number

  // ─── Derivados (compat con clientes antiguos, se ignoran) ───
  @IsInt()
  @Min(0)
  @IsOptional()
  points?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  fieldGoalsMade?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  fieldGoalsAttempted?: number

  // ─── Extras ─────────────────────────────────────────────────
  @IsInt()
  @Min(0)
  @IsOptional()
  blocksAgainst?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  foulsDrawn?: number

  /**
   * Puede ser negativo (jugador en cancha mientras el rival anota más).
   * No ponemos @Min(0).
   */
  @IsInt()
  @IsOptional()
  plusMinus?: number
}