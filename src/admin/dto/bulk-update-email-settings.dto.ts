import { IsArray, IsBoolean, IsString, ArrayNotEmpty } from 'class-validator';

export class BulkUpdateEmailSettingsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  userIds: string[];

  @IsBoolean()
  enabled: boolean;
}