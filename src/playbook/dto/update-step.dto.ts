import { IsOptional, IsString, IsInt, ValidateIf } from 'class-validator'

export class UpdateStepDto {
  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @ValidateIf((o) => o.imageUrl !== null)
  @IsString()
  imageUrl?: string | null

  @IsOptional()
  @IsInt()
  order?: number

  // ✅ Dejamos que Prisma valide el JSON directamente
  @IsOptional()
  tacticalData?: any
}