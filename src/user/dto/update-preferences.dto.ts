import { IsArray, IsOptional, IsString } from 'class-validator'

export class UpdatePreferencesDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hiddenTabs?: string[]
}