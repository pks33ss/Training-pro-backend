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

  // Para el menú de "vincular a partido": devuelve todos los partidos del
  // equipo con un flag "ya tiene stats".
  @IsOptional()
  @IsString()
  includeMatches?: string // "true"
}