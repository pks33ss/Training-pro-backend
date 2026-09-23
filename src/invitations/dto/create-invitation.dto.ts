import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsNotEmpty,
} from 'class-validator'

export enum InvitationChannel {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  LINK = 'LINK',
}

export enum MembershipRole {
  PLAYER = 'PLAYER',
  COACH = 'COACH',
  ASSISTANT = 'ASSISTANT',
  ADMIN_TEAM = 'ADMIN_TEAM',
}

export class CreateInvitationDto {
  @IsString()
  @IsNotEmpty()
  teamId: string

  @IsEnum(MembershipRole)
  @IsOptional()
  role?: MembershipRole = MembershipRole.PLAYER

  @IsEnum(InvitationChannel)
  @IsOptional()
  channel?: InvitationChannel = InvitationChannel.LINK

  @IsEmail()
  @IsOptional()
  email?: string

  @IsString()
  @IsOptional()
  phone?: string

  /**
   * Si se pasa userId, la invitación es para un usuario existente (por ejemplo, un fantasma).
   * Si no, se crea una invitación "libre" que se reclamará por email o código.
   */
  @IsString()
  @IsOptional()
  userId?: string
}