import { IsString, IsNotEmpty, IsOptional, IsEmail, IsInt, Min, Max, IsBoolean } from 'class-validator'

export class CreateGhostDto {
  @IsString()
  @IsNotEmpty()
  name: string

  @IsString()
  @IsNotEmpty()
  lastName: string

  @IsString()
  @IsNotEmpty()
  teamId: string

  @IsEmail()
  @IsOptional()
  email?: string

  @IsString()
  @IsOptional()
  phone?: string

  @IsInt()
  @Min(0)
  @Max(999)
  @IsOptional()
  jerseyNumber?: number

  @IsString()
  @IsOptional()
  position?: string

  @IsString()
  @IsOptional()
  role?: string

  // ✅ NUEVO — Si es true y hay email, se envía invitación de registro
  @IsBoolean()
  @IsOptional()
  sendInvitation?: boolean
}