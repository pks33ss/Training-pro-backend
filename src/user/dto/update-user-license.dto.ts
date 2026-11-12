import { IsEnum } from 'class-validator';
import { LicenseType } from '@prisma/client';

export class UpdateUserLicenseDto {
  @IsEnum(LicenseType)
  licenseType: LicenseType;
}