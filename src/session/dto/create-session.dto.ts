import { IsString, IsNotEmpty, IsOptional, IsDateString, IsInt, Min, IsUUID } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  @IsNotEmpty({ message: 'El título es requerido' })
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString({}, { message: 'La fecha debe ser una fecha válida' })
  @IsNotEmpty({ message: 'La fecha es requerida' })
  date: string;

  @IsInt({ message: 'La duración debe ser un número entero' })
  @Min(1, { message: 'La duración debe ser al menos 1 minuto' })
  duration: number;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString() // ✅ Cambiar a IsString para CUIDs
  @IsNotEmpty({ message: 'El ID del equipo es requerido' })
  teamId: string;
}