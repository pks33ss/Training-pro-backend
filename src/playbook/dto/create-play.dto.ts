import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreatePlayDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  teamId: string;
}