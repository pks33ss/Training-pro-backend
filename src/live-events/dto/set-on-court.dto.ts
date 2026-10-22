// backend/src/live-events/dto/set-on-court.dto.ts

import { IsBoolean } from 'class-validator'

export class SetOnCourtDto {
  @IsBoolean()
  onCourt: boolean
}