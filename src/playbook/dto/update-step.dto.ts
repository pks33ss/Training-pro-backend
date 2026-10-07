import { IsString, IsOptional, IsInt, Min } from 'class-validator';

export class UpdateStepDto {
  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  order?: number;
}