import { IsOptional, IsString, IsISO8601 } from 'class-validator'

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
}