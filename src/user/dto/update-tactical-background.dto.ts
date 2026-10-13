import { IsOptional, IsString, IsIn } from 'class-validator'

export class UpdateTacticalBackgroundDto {
  @IsOptional()
  @IsString()
  urlHalf?: string | null

  @IsOptional()
  @IsString()
  urlFull?: string | null

  @IsOptional()
  @IsIn(['HALF', 'FULL'])
  mode?: 'HALF' | 'FULL'
}