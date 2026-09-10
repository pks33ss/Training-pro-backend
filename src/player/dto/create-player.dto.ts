import { IsString, IsNotEmpty, IsOptional, IsNumber, IsInt } from 'class-validator';

export class CreatePlayerDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es requerido' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'El apellido es requerido' })
  lastName: string;

  @IsString()
  @IsOptional()
  position?: string;

  @IsInt()
  @IsOptional()
  number?: number;

  @IsString() // ✅ Cambiar de @IsUUID() a @IsString()
  @IsNotEmpty({ message: 'El ID del equipo es requerido' })
  teamId: string;
}