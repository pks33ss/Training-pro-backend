import { Type } from 'class-transformer'
import {
  IsArray,
  ArrayNotEmpty,
  IsString,
  IsOptional,
  IsIn,
  ValidateNested,
} from 'class-validator'

export class RoleAssignmentDto {
  @IsString()
  name: string

  @IsIn(['ALL', 'TEAMS'])
  scope: 'ALL' | 'TEAMS'

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  teamIds?: string[]
}

export class UpdateMemberRolesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RoleAssignmentDto)
  roles: RoleAssignmentDto[]
}