import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import { StatsAudienceRole, StatsScope } from '@prisma/client'

export class StatsConfigEntryDto {
  @IsEnum(StatsScope)
  scope!: StatsScope

  @IsEnum(StatsAudienceRole)
  role!: StatsAudienceRole

  @IsString()
  metricKey!: string

  @IsBoolean()
  visible!: boolean
}

export class UpdateStatsConfigDto {
  /**
   * Lista de entradas a aplicar. Solo se sobreescriben las que vienen.
   * Las demás filas existentes se conservan.
   * Si `reset: true` → borra TODAS las filas del scope(s) y aplica el resto.
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StatsConfigEntryDto)
  entries!: StatsConfigEntryDto[]

  /**
   * Si viene un array de scopes, se limpian las filas existentes de ese
   * team/sport en esos scopes antes de aplicar `entries`.
   * Si no viene, se hace upsert selectivo (solo las entradas enviadas).
   */
  @IsOptional()
  @IsArray()
  @IsEnum(StatsScope, { each: true })
  resetScopes?: StatsScope[]
}