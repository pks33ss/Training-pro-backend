// backend/src/stat-sessions/dto/create-stat-session.dto.ts

import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator'
import { StatSessionType } from '@prisma/client'

/**
 * Crear una StatSession en /teams/:teamId/stat-sessions.
 *
 * Todas las sesiones son independientes (no se vinculan a un Match).
 * matchId existe solo por compatibilidad: si se recibe, el service
 * rechaza la petición.
 *
 * label y statDate son obligatorios.
 */
export class CreateStatSessionDto {
  @IsEnum(StatSessionType)
  type: StatSessionType

  // Compatibilidad: si se recibe, el service devuelve 400
  @IsOptional()
  @IsString()
  @MaxLength(64)
  matchId?: string

  @IsString()
  @MaxLength(200)
  label: string

  @IsISO8601()
  statDate: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  opponent?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  opponentTeamName?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  opponentPlayerCount?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  teamScore?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  opponentScore?: number
}