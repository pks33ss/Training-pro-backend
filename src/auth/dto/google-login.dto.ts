import { IsString, IsNotEmpty, IsOptional } from 'class-validator'

export class GoogleLoginDto {
  @IsString()
  @IsNotEmpty({ message: 'El idToken es requerido' })
  idToken!: string

  @IsOptional()
  @IsString()
  invitationCode?: string
}