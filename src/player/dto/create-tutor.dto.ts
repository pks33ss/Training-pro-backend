import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsEmail } from 'class-validator'

export class CreateTutorDto {
  @IsString()
  @IsNotEmpty()
  name: string

  @IsString()
  @IsNotEmpty()
  lastName: string

  @IsString()
  @IsNotEmpty()
  relationship: string  // padre, madre, tutor_legal, otro

  @IsString()
  @IsOptional()
  phone?: string

  @IsEmail()
  @IsOptional()
  email?: string

  @IsBoolean()
  @IsOptional()
  canPickUp?: boolean

  @IsBoolean()
  @IsOptional()
  isEmergencyContact?: boolean
}