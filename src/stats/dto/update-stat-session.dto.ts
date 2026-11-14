import { IsBoolean, IsOptional } from 'class-validator'

export class UpdateStatSessionDto {
  @IsOptional()
  @IsBoolean()
  includeInTeamStats?: boolean

  @IsOptional()
  @IsBoolean()
  reopen?: boolean // Si es true, pone closedAt a null
}