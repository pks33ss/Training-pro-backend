import { IsOptional, IsString, IsISO8601, IsArray } from 'class-validator'
import { Transform } from 'class-transformer'

export class PlayerStatsQueryDto {
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