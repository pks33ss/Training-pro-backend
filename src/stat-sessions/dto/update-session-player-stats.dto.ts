// backend/src/stat-sessions/dto/update-session-player-stats.dto.ts

import { IsInt, IsOptional, Min } from 'class-validator'

/**
 * Editar stats de un jugador dentro de una StatSession.
 *
 * Mismos campos que UpdateStatsDto (el que ya usa /matches/:id/stats/:userId),
 * para no romper el frontend. Es un superset: si en el futuro añades más
 * campos a UpdateStatsDto, añádelos aquí también.
 */
export class UpdateSessionPlayerStatsDto {
  @IsOptional() @IsInt() @Min(0) minutes?: number
  @IsOptional() @IsInt() @Min(0) seconds?: number
  @IsOptional() @IsInt() @Min(0) points?: number
  @IsOptional() @IsInt() @Min(0) rebounds?: number
  @IsOptional() @IsInt() @Min(0) assists?: number
  @IsOptional() @IsInt() @Min(0) steals?: number
  @IsOptional() @IsInt() @Min(0) blocks?: number
  @IsOptional() @IsInt() @Min(0) turnovers?: number
  @IsOptional() @IsInt() @Min(0) fouls?: number
  @IsOptional() @IsInt() @Min(0) blocksAgainst?: number
  @IsOptional() @IsInt() @Min(0) foulsDrawn?: number
  @IsOptional() @IsInt() plusMinus?: number
  @IsOptional() @IsInt() @Min(0) fieldGoalsMade?: number
  @IsOptional() @IsInt() @Min(0) fieldGoalsAttempted?: number
  @IsOptional() @IsInt() @Min(0) threePointersMade?: number
  @IsOptional() @IsInt() @Min(0) threePointersAttempted?: number
  @IsOptional() @IsInt() @Min(0) freeThrowsMade?: number
  @IsOptional() @IsInt() @Min(0) freeThrowsAttempted?: number
}