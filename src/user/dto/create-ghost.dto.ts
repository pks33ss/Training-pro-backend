import { IsString, IsNotEmpty, IsOptional, IsEmail, IsInt, Min, Max } from 'class-validator'

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
  role?: string // PLAYER | COACH | ASSISTANT | ADMIN_TEAM (default PLAYER)
}