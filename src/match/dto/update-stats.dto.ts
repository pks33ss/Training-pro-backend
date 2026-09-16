import { IsInt, IsOptional, Min } from 'class-validator'

export class UpdateStatsDto {
  @IsInt()
  @Min(0)
  @IsOptional()
  minutes?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  points?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  rebounds?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  assists?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  steals?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  blocks?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  turnovers?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  fouls?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  fieldGoalsMade?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  fieldGoalsAttempted?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  threePointersMade?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  threePointersAttempted?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  freeThrowsMade?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  freeThrowsAttempted?: number
}