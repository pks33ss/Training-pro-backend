// backend/src/stat-sessions/dto/list-stat-sessions-query.dto.ts

import { IsEnum, IsOptional, IsString } from 'class-validator'
import { StatSessionType } from '@prisma/client'

export class ListStatSessionsQueryDto {
  @IsOptional()
  @IsEnum(StatSessionType)
  type?: StatSessionType

  @IsOptional()
  @IsString()
  season?: string

  @IsOptional()
  @IsString()
  includeMatches?: string // "true"

  /**
   * NUEVO: devuelve solo las sesiones TRAINING cerradas con
   * includeInTeamStats = true. Se usa en el filtro del agregado de
   * entrenamientos.
   */
  @IsOptional()
  @IsString()
  trainingAggregatesOnly?: string // "true"
}