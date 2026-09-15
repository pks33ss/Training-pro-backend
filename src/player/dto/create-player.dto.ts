import { IsString, IsNotEmpty, IsOptional, IsInt, IsNumber, IsEmail } from 'class-validator'

export class CreatePlayerDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es requerido' })
  name: string

  @IsString()
  @IsNotEmpty({ message: 'El apellido es requerido' })
  lastName: string

  @IsString()
  @IsOptional()
  birthDate?: string

  @IsString()
  @IsOptional()
  position?: string

  @IsInt()
  @IsOptional()
  number?: number

  @IsString()
  @IsOptional()
  phone?: string

  @IsEmail()
  @IsOptional()
  email?: string

  @IsString()
  @IsOptional()
  address?: string

  @IsNumber()
  @IsOptional()
  height?: number

  @IsNumber()
  @IsOptional()
  wingspan?: number

  @IsNumber()
  @IsOptional()
  weight?: number

  @IsString()
  @IsNotEmpty({ message: 'El ID del equipo es requerido' })
  teamId: string
}