import { IsOptional, IsString } from 'class-validator';

export class MyPaymentsQueryDto {
  @IsOptional()
  @IsString()
  season?: string;
}