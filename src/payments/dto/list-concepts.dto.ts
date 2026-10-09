import { IsOptional, IsString } from 'class-validator';

export class ListConceptsDto {
  @IsOptional()
  @IsString()
  clubId?: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  season?: string;
}