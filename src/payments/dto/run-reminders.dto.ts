import { IsOptional, IsString, IsBoolean } from 'class-validator';

export class RunRemindersDto {
  /** Filtrar por temporada. Ej: "2026-27". */
  @IsOptional()
  @IsString()
  season?: string;

  /** Filtrar por club. Si se omite, se procesan todos los clubs. */
  @IsOptional()
  @IsString()
  clubId?: string;

  /** Filtrar por equipo. Si se omite, se procesan todos los equipos. */
  @IsOptional()
  @IsString()
  teamId?: string;

  /**
   * Si true, simula la ejecución sin enviar emails ni crear registros.
   */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}