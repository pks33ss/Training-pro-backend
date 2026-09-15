import { IsString, IsOptional, IsEmail, MaxLength } from 'class-validator'

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string

  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string

  @IsEmail()
  @IsOptional()
  email?: string

  @IsString()
  @IsOptional()
  phone?: string

  @IsString()
  @IsOptional()
  @MaxLength(500)
  bio?: string

  @IsString()
  @IsOptional()
  avatar?: string
}