import {
  IsOptional,
  IsString,
  IsISO8601,
  IsEnum,
  MaxLength,
} from 'class-validator'
import { InjuryStatus } from '@prisma/client'

export class UpdateInjuryDto {
  @IsOptional()
  @IsISO8601()
  date?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  bodyPart?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  severity?: string

  @IsOptional()
  @IsEnum(InjuryStatus)
  status?: InjuryStatus

  @IsOptional()
  @IsISO8601()
  expectedReturn?: string

  @IsOptional()
  @IsISO8601()
  actualReturn?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  treatment?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  doctor?: string

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string
}