// backend/src/permissions/dto/preview-impact.dto.ts
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  ValidateNested,
} from 'class-validator'
import { RolePermissionInput } from './set-role-permissions.dto'

export class PreviewImpactDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => RolePermissionInput)
  permissions!: RolePermissionInput[]
}