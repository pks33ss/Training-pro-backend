// backend/src/permissions/dto/update-role.dto.ts
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class UpdateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @IsOptional()
  name?: string

  @IsString()
  @MaxLength(200)
  @IsOptional()
  description?: string
}