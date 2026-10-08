import { IsBoolean } from 'class-validator';

export class UpdateEmailSettingDto {
  @IsBoolean()
  enabled: boolean;
}