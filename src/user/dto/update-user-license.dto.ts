import { IsEnum, IsOptional } from 'class-validator';
import { LicenseType, Sport } from '@prisma/client';

export class UpdateUserLicenseDto {
  @IsEnum(LicenseType)
  licenseType: LicenseType;

  /**
   * Deporte restringido cuando licenseType = BETA.
   * Opcional: si no se envía, no se modifica el valor actual.
   */
  @IsEnum(Sport)
  @IsOptional()
  licenseSport?: Sport;
}