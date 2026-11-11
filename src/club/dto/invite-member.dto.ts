import { Type } from 'class-transformer'
import {
  IsEmail,
  IsArray,
  ArrayNotEmpty,
  ValidateNested,
  IsOptional,
  IsString,
} from 'class-validator'
import { RoleAssignmentDto } from './update-member-roles.dto'

export class InviteMemberDto {
  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  lastName?: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RoleAssignmentDto)
  roles: RoleAssignmentDto[]
}