import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class AddLibraryMediaDto {
  @IsString()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsIn(['IMAGE', 'VIDEO', 'LINK'])
  type: 'IMAGE' | 'VIDEO' | 'LINK';

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;
}