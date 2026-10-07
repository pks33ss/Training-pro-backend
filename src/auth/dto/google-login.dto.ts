import { IsString, IsNotEmpty } from 'class-validator'

export class GoogleLoginDto {
  @IsString()
  @IsNotEmpty({ message: 'El idToken es requerido' })
  idToken!: string
}