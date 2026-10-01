import { IsOptional, IsString, IsISO8601, IsArray } from 'class-validator'
import { Transform } from 'class-transformer'

export class TeamStatsQueryDto {
  @IsOptional()
  @IsString()
  seasonId?: string

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
  matchIds?: string[]

  /**
   * Equipos adicionales (además del :id del path) que se agregan
   * en las estadísticas. Todos deben:
   *  - pertenecer al mismo deporte que el team principal
   *  - estar accesibles para el viewer
   * Si el sport difiere → 400.
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
  teamIds?: string[]
}