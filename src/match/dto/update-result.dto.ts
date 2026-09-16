import { IsInt, IsOptional, Min } from 'class-validator'

export class UpdateResultDto {
  @IsInt()
  @Min(0)
  teamScore: number

  @IsInt()
  @Min(0)
  opponentScore: number
}