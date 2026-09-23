import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator'

export enum MembershipRole {
  PLAYER = 'PLAYER',
  COACH = 'COACH',
  ASSISTANT = 'ASSISTANT',
  ADMIN_TEAM = 'ADMIN_TEAM',
}

export class CreateMembershipDto {
  @IsString()
  @IsNotEmpty()
  teamId: string

  @IsEnum(MembershipRole)
  @IsOptional()
  role?: MembershipRole = MembershipRole.PLAYER

  @IsString()
  @IsOptional()
  message?: string // mensaje opcional al solicitar unirse
}