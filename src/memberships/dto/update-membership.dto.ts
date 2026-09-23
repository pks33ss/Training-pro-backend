import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator'
import { MembershipRole } from './create-membership.dto'

export class UpdateMembershipDto {
  @IsEnum(MembershipRole)
  @IsOptional()
  role?: MembershipRole

  @IsInt()
  @Min(0)
  @Max(999)
  @IsOptional()
  jerseyNumber?: number

  @IsString()
  @IsOptional()
  position?: string
}