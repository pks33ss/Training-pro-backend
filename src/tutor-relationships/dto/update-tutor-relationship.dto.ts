import { IsOptional, IsBoolean, IsEnum } from 'class-validator'
import { TutorRelationshipType } from './create-tutor-relationship.dto'

export class UpdateTutorRelationshipDto {
  @IsEnum(TutorRelationshipType)
  @IsOptional()
  relationship?: TutorRelationshipType

  @IsBoolean()
  @IsOptional()
  canPickUp?: boolean

  @IsBoolean()
  @IsOptional()
  isEmergencyContact?: boolean
}