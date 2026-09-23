import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsEnum,
} from 'class-validator'

export enum TutorRelationshipType {
  PADRE = 'padre',
  MADRE = 'madre',
  TUTOR_LEGAL = 'tutor_legal',
  OTRO = 'otro',
}

export class CreateTutorRelationshipDto {
  /**
   * Username del jugador (con o sin @).
   * Ej: "@juanperez142" o "juanperez142".
   */
  @IsString()
  @IsNotEmpty()
  playerUsername: string

  @IsEnum(TutorRelationshipType)
  @IsOptional()
  relationship?: TutorRelationshipType = TutorRelationshipType.OTRO

  @IsBoolean()
  @IsOptional()
  canPickUp?: boolean = true

  @IsBoolean()
  @IsOptional()
  isEmergencyContact?: boolean = false
}