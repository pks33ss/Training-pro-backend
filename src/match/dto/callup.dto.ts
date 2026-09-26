import { IsString, IsArray } from 'class-validator'

export class CreateCallupsDto {
  @IsArray()
  @IsString({ each: true })
  userIds: string[]
}