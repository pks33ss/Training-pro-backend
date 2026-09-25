import { IsString, IsNotEmpty, IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator'
import { MembershipRole } from './create-membership.dto'

export class AddMemberDto {
  @IsString()
  @IsNotEmpty()
  userId: string

  @IsEnum(MembershipRole)
  @IsOptional()
  role?: MembershipRole = MembershipRole.PLAYER

  @IsInt()
  @Min(0)
  @Max(999)
  @IsOptional()
  jerseyNumber?: number

  @IsString()
  @IsOptional()
  position?: string
}