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

  // Obligatoria al crear equipo. Se compone en el frontend como "2026-27".
  @IsString()
  @IsNotEmpty({ message: 'La temporada es obligatoria' })
  season: string

  @IsString()
  @IsNotEmpty()
  clubId: string

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