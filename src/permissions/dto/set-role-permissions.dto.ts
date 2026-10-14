// backend/src/permissions/dto/set-role-permissions.dto.ts
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator'
import {
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
} from '../permissions.constants'

export class RolePermissionInput {
  @IsIn(PERMISSION_RESOURCES)
  resource!: string

  @IsIn(PERMISSION_ACTIONS)
  action!: string

  /** null = club-wide; "team:<id>" = solo ese equipo. */
  @IsOptional()
  @IsString()
  scope?: string | null

  @IsBoolean()
  granted!: boolean
}

export class SetRolePermissionsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => RolePermissionInput)
  permissions!: RolePermissionInput[]
}