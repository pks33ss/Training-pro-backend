import { IsString, IsNotEmpty, IsOptional, IsEmail, IsEnum, ValidateIf } from 'class-validator';
import { LicenseType, Sport } from '@prisma/client';

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

  // ✅ NUEVO — Tipo de licencia. Solo el SUPER_ADMIN puede cambiarlo.
  @IsEnum(LicenseType)
  @IsOptional()
  licenseType?: LicenseType;

  // ✅ NUEVO — Deporte restringido (solo aplica cuando licenseType = BETA).
  // Solo el SUPER_ADMIN puede cambiarlo.
  @IsEnum(Sport)
  @IsOptional()
  licenseSport?: Sport;
}