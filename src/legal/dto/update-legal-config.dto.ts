import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator'

export class UpdateLegalConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  razonSocial?: string

  @IsOptional()
  @IsString()
  @MaxLength(30)
  nif?: string

  @IsOptional()
  @IsString()
  @MaxLength(300)
  direccion?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ciudad?: string

  @IsOptional()
  @IsString()
  @MaxLength(20)
  codigoPostal?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  pais?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefono?: string

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  emailContacto?: string

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  emailPrivacidad?: string

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  emailCookies?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  registroMercantil?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  dominio?: string

  @IsOptional()
  @IsString()
  @MaxLength(300)
  actividad?: string
}