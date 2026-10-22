// backend/src/match-import/dto/import-from-session.dto.ts

import { IsBoolean, IsOptional, IsString } from 'class-validator'

export class ImportFromSessionDto {
  @IsString()
  statSessionId: string

  @IsOptional()
  @IsBoolean()
  overwrite?: boolean
}