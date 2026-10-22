// backend/src/stat-sessions/dto/update-stat-session.dto.ts

import { IsISO8601, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'

/**
 * Editar el header de una StatSession.
 *
 * Todos los campos son opcionales. Los campos que se pueden editar:
 *  - label, statDate, opponent, teamScore, opponentScore.
 *
 * NO se puede cambiar `type` ni `matchId` (eso sería crear otra sesión).
 */
export class UpdateStatSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string

  @IsOptional()
  @IsISO8601()
  statDate?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  opponent?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  teamScore?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  opponentScore?: number
}