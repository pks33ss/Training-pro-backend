import { IsArray, IsString, ArrayNotEmpty } from 'class-validator';

export class AssignPlayersDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  userIds: string[];
}