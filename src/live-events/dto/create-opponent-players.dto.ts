// backend/src/live-events/dto/create-opponent-players.dto.ts

import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

class OpponentPlayerInput {
  @IsInt()
  @Min(0)
  @Max(999)
  number: number

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(20)
  position?: string

  // Si el rival es un equipo del club, se pasa el userId real
  @IsOptional()
  @IsString()
  userId?: string
}

export class CreateOpponentPlayersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => OpponentPlayerInput)
  players: OpponentPlayerInput[]
}