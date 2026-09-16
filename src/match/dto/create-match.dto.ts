import { IsString, IsNotEmpty, IsOptional, IsDateString, IsEnum } from 'class-validator'

export enum MatchType {
  LEAGUE = 'LEAGUE',
  FRIENDLY = 'FRIENDLY',
  CUP = 'CUP',
  PLAYOFF = 'PLAYOFF',
  TOURNAMENT = 'TOURNAMENT',
}

export enum MatchLocation {
  HOME = 'HOME',
  AWAY = 'AWAY',
  NEUTRAL = 'NEUTRAL',
}

export class CreateMatchDto {
  @IsDateString()
  @IsNotEmpty({ message: 'La fecha es requerida' })
  date: string

  @IsString()
  @IsNotEmpty({ message: 'El rival es requerido' })
  opponent: string

  @IsEnum(MatchLocation)
  @IsOptional()
  location?: MatchLocation

  @IsEnum(MatchType)
  @IsOptional()
  type?: MatchType

  @IsString()
  @IsOptional()
  venue?: string

  @IsString()
  @IsOptional()
  competition?: string

  @IsString()
  @IsOptional()
  notes?: string

  @IsString()
  @IsNotEmpty()
  teamId: string
}