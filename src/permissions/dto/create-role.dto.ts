// backend/src/permissions/dto/create-role.dto.ts
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name!: string

  @IsString()
  @IsOptional()
  @MaxLength(200)
  description?: string

  @IsIn(['CLUB', 'TEAM'])
  scope!: 'CLUB' | 'TEAM'
}