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

  // ✅ NUEVO — Identidad visual del equipo (override del club)
  @IsString()
  @IsOptional()
  primaryColor?: string

  @IsString()
  @IsOptional()
  secondaryColor?: string

  @IsString()
  @IsOptional()
  logo?: string
}