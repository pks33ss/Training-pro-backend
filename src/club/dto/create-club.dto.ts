import { IsString, IsNotEmpty, IsOptional, IsEmail, IsEnum, ValidateIf } from 'class-validator';
import { LicenseType } from '@prisma/client';

export class CreateClubDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @ValidateIf((o) => o.email !== undefined && o.email !== null && o.email !== '')
  @IsEmail()
  @IsOptional()
  email?: string | null;

  // ✅ NUEVO — Colores de la identidad visual
  @IsString()
  @IsOptional()
  primaryColor?: string;

  @IsString()
  @IsOptional()
  secondaryColor?: string;

  // ✅ NUEVO — Tipo de licencia. Solo el SUPER_ADMIN puede cambiarlo
  // (lo ignora el service si el actor no es SUPER_ADMIN).
  @IsEnum(LicenseType)
  @IsOptional()
  licenseType?: LicenseType;
}