// backend/src/stats/dto/team-stats-query.dto.ts

import { IsOptional, IsString, IsISO8601, IsArray } from 'class-validator'
import { Transform } from 'class-transformer'

export class TeamStatsQueryDto {
  @IsOptional()
  @IsString()
  season?: string

  @IsOptional()
  @IsISO8601()
  from?: string

  @IsOptional()
  @IsISO8601()
  to?: string

  /**
   * Compatibilidad: filtro por 1 jugador.
   * Si llega `playerIds`, este se ignora.
   */
  @IsOptional()
  @IsString()
  playerId?: string

  /**
   * Filtro multi-jugador. Acepta CSV o array.
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null) return undefined
    if (Array.isArray(value)) return value
    if (typeof value === 'string') {
      return value.split(',').map((s) => s.trim()).filter(Boolean)
    }
    return undefined
  })
  @IsArray()
  @IsString({ each: true })
  playerIds?: string[]

  @IsOptional()
  @Transform(({ value }) => {
    if (value == null) return undefined
    if (Array.isArray(value)) return value
    if (typeof value === 'string') {
      return value.split(',').map((s) => s.trim()).filter(Boolean)
    }
    return undefined
  })
  @IsArray()
  @IsString({ each: true })
  matchIds?: string[]

  @IsOptional()
  @Transform(({ value }) => {
    if (value == null) return undefined
    if (Array.isArray(value)) return value
    if (typeof value === 'string') {
      return value.split(',').map((s) => s.trim()).filter(Boolean)
    }
    return undefined
  })
  @IsArray()
  @IsString({ each: true })
  teamIds?: string[]

  @IsOptional()
  @IsString()
  trendMetric?: string
}