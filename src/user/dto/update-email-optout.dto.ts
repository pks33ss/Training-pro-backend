import { IsBoolean } from 'class-validator'

export class UpdateEmailOptOutDto {
  @IsBoolean()
  optOut: boolean
}