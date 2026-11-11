// backend/src/permissions/dto/set-role-permissions.dto.ts

import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import { PERMISSION_RESOURCES } from '../permissions.constants'

export class RolePermissionInput {
  @IsString()
  @IsIn(PERMISSION_RESOURCES as unknown as string[])
  resource!: string

  @IsString()
  @IsIn(['view', 'create', 'edit', 'delete'])
  action!: 'view' | 'create' | 'edit' | 'delete'

  @IsOptional()
  @IsString()
  scope?: string | null

  @IsOptional()
  @IsString()
  teamId?: string | null

  @IsBoolean()
  granted!: boolean
}

export class SetRolePermissionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RolePermissionInput)
  permissions!: RolePermissionInput[]
}