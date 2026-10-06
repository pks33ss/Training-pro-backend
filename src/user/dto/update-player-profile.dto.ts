import {
  IsOptional,
  IsString,
  IsISO8601,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator'

export class UpdatePlayerProfileDto {
  // ─── Personales ───
  @IsOptional()
  @IsISO8601()
  birthDate?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(20)
  dni?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fatherName?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(120)
  motherName?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(30)
  fatherPhone?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(30)
  motherPhone?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(240)
  address?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(160)
  schoolOrCompany?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(500)
  allergies?: string | null

  // ─── Deportivos ───
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(300)
  height?: number | null

  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(300)
  wingspan?: number | null

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(300)
  weight?: number | null

  // ─── Emergencia ───
  @IsOptional()
  @IsString()
  @MaxLength(120)
  emergencyContactName?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(30)
  emergencyContactPhone?: string | null

  // ─── Seguro médico ───
  @IsOptional()
  @IsString()
  @MaxLength(160)
  medicalInsurance?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(60)
  medicalInsuranceNumber?: string | null

  // ─── Tallas ───
  @IsOptional()
  @IsString()
  @MaxLength(10)
  shirtSize?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(10)
  pantsSize?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(10)
  shoeSize?: string | null
}