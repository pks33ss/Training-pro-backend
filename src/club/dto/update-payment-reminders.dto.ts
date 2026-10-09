import { IsBoolean } from 'class-validator';

export class UpdatePaymentRemindersDto {
  @IsBoolean()
  enabled: boolean;
}