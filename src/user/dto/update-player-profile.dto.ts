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
  birthDate?: string

  @IsOptional()
  @IsString()
  @MaxLength(20)
  dni?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fatherName?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  motherName?: string

  @IsOptional()
  @IsString()
  @MaxLength(30)
  fatherPhone?: string

  @IsOptional()
  @IsString()
  @MaxLength(30)
  motherPhone?: string

  @IsOptional()
  @IsString()
  @MaxLength(240)
  address?: string

  @IsOptional()
  @IsString()
  @MaxLength(160)
  schoolOrCompany?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  allergies?: string

  // ─── Deportivos ───
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(300)
  height?: number

  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(300)
  wingspan?: number

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(300)
  weight?: number

  // ─── Emergencia ───
  @IsOptional()
  @IsString()
  @MaxLength(120)
  emergencyContactName?: string

  @IsOptional()
  @IsString()
  @MaxLength(30)
  emergencyContactPhone?: string

  // ─── Seguro médico ───
  @IsOptional()
  @IsString()
  @MaxLength(160)
  medicalInsurance?: string

  @IsOptional()
  @IsString()
  @MaxLength(60)
  medicalInsuranceNumber?: string

  // ─── Tallas ───
  @IsOptional()
  @IsString()
  @MaxLength(10)
  shirtSize?: string

  @IsOptional()
  @IsString()
  @MaxLength(10)
  pantsSize?: string

  @IsOptional()
  @IsString()
  @MaxLength(10)
  shoeSize?: string
}