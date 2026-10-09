import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsDateString,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsIn,
} from 'class-validator';


export class CreateConceptDto {
  @IsString()
  clubId: string;

  /**
   * Si se indica teamId, el concepto aplica solo a ese equipo.
   * Si es null/undefined, aplica a nivel club.
   */
  @IsOptional()
  @IsString()
  teamId?: string | null;

  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** Importe por jugador */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @IsDateString()
  dueDate: string;

  @IsString()
  @MaxLength(20)
  season: string;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsBoolean()
  emailRemindersEnabled?: boolean;

  /**
   * Modo de asignación:
   * - 'ALL_TEAM': asigna a todos los jugadores ACTIVE del team.
   *   Requiere teamId.
   * - 'NONE': no asigna a nadie.
   *
   * Por defecto: 'ALL_TEAM' si hay teamId, 'NONE' si no.
   */
  @IsOptional()
  @IsIn(['ALL_TEAM', 'NONE'])
  assignmentMode?: 'ALL_TEAM' | 'NONE';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  reminderDaysBefore?: number;

}