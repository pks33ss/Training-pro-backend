import { IsOptional, IsString, IsInt, IsObject } from 'class-validator'

export class AddStepDto {
  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsString()
  imageUrl?: string | null

  @IsOptional()
  @IsInt()
  order?: number

  // ✅ NUEVO — JSON serializado de la pizarra (opcional)
  @IsOptional()
  @IsObject()
  tacticalData?: Record<string, any> | null
}