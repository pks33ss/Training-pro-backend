import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateTeamDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del equipo es requerido' })
  name: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  season?: string;

  @IsString() // ✅ Cambiar de IsUUID a IsString
  @IsNotEmpty({ message: 'El ID del club es requerido' })
  clubId: string;
}