// backend/src/stats/dto/team-stats-query.dto.ts

import { IsOptional, IsString, IsISO8601, IsArray, IsBoolean, IsIn } from 'class-validator'
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

  @IsOptional()
  @IsString()
  playerId?: string

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

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true
    if (value === 'false' || value === false) return false
    return undefined
  })
  @IsBoolean()
  includeTrainingSessions?: boolean

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
  trainingSessionIds?: string[]

  /**
   * NUEVO: define cómo se combinan los entrenamientos con los partidos.
   * - 'only': solo entrenamientos (comportamiento del tab "Agregado Entrenamientos")
   * - 'merge': partidos + entrenamientos (toggle en "Agregado Partidos")
   */
  @IsOptional()
  @IsString()
  @IsIn(['only', 'merge'])
  trainingSessionsMode?: 'only' | 'merge'
}