import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  IsIn,
  Min,
  MaxLength,
} from 'class-validator';

export const PAYMENT_METHODS = [
  'CASH',
  'TRANSFER',
  'BIZUM',
  'CARD',
  'OTHER',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export class CreatePaymentDto {
  @IsString()
  conceptId: string;

  @IsString()
  userId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  /** Por defecto: now() */
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  @IsIn(PAYMENT_METHODS as unknown as string[])
  method?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  receiptUrl?: string;
}