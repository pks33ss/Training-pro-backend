import { IsString, IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';

export class AddExerciseDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  duration?: number;

  @IsString()
  @IsOptional()
  difficulty?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  order?: number;
}