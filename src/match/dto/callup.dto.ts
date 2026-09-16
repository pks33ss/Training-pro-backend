import { IsString, IsOptional, IsArray } from 'class-validator'

export class CreateCallupsDto {
  @IsArray()
  @IsString({ each: true })
  playerIds: string[]
}