import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator'

export enum Sport {
  BASKETBALL = 'BASKETBALL',
  PADEL = 'PADEL',
  FOOTBALL = 'FOOTBALL',
  HANDBALL = 'HANDBALL',
  VOLLEYBALL = 'VOLLEYBALL',
  TENNIS = 'TENNIS',
}

export class CreateTeamDto {
  @IsString()
  @IsNotEmpty()
  name: string

  @IsEnum(Sport)
  @IsOptional()
  sport?: Sport

  @IsString()
  @IsOptional()
  category?: string

  @IsString()
  @IsOptional()
  season?: string

  @IsString()
  @IsNotEmpty()
  clubId: string
}