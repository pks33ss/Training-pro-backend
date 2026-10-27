// backend/src/stat-sessions/dto/update-session-player-stats.dto.ts

import { IsInt, IsOptional, Max, Min } from 'class-validator'

/**
 * Editar stats de un jugador dentro de una StatSession.
 *
 * Mismos campos que UpdateStatsDto (el que ya usa /matches/:id/stats/:userId),
 * para no romper el frontend. Es un superset: si en el futuro añades más
 * campos a UpdateStatsDto, añádelos aquí también.
 *
 * NOTA: `points`, `fieldGoalsMade` y `fieldGoalsAttempted` se aceptan por
 * compatibilidad con clientes antiguos, pero el backend los IGNORA y los
 * recalcula a partir de 2P, 3P y TL:
 *   PTS = 2*2PM + 3*3PM + FTM
 *   FGM = 2PM + 3PM
 *   FGA = 2PA + 3PA
 */
export class UpdateSessionPlayerStatsDto {
  @IsOptional() @IsInt() @Min(0) minutes?: number
  @IsOptional() @IsInt() @Min(0) @Max(59) seconds?: number
  @IsOptional() @IsInt() @Min(0) rebounds?: number
  @IsOptional() @IsInt() @Min(0) assists?: number
  @IsOptional() @IsInt() @Min(0) steals?: number
  @IsOptional() @IsInt() @Min(0) blocks?: number
  @IsOptional() @IsInt() @Min(0) turnovers?: number
  @IsOptional() @IsInt() @Min(0) fouls?: number
  @IsOptional() @IsInt() @Min(0) blocksAgainst?: number
  @IsOptional() @IsInt() @Min(0) foulsDrawn?: number
  @IsOptional() @IsInt() plusMinus?: number

  // ─── Tiros de 2 (FUENTE DE VERDAD) ──────────────────────────
  @IsOptional() @IsInt() @Min(0) twoPointersMade?: number
  @IsOptional() @IsInt() @Min(0) twoPointersAttempted?: number

  // ─── Tiros de 3 (FUENTE DE VERDAD) ──────────────────────────
  @IsOptional() @IsInt() @Min(0) threePointersMade?: number
  @IsOptional() @IsInt() @Min(0) threePointersAttempted?: number

  // ─── Tiros libres (FUENTE DE VERDAD) ────────────────────────
  @IsOptional() @IsInt() @Min(0) freeThrowsMade?: number
  @IsOptional() @IsInt() @Min(0) freeThrowsAttempted?: number

  // ─── Derivados (compat con clientes antiguos, se ignoran) ───
  @IsOptional() @IsInt() @Min(0) points?: number
  @IsOptional() @IsInt() @Min(0) fieldGoalsMade?: number
  @IsOptional() @IsInt() @Min(0) fieldGoalsAttempted?: number
}