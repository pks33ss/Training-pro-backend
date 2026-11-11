import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  IsEmail,
  Min,
  Max,
  ValidateIf,
} from 'class-validator'
import { MembershipRole } from './create-membership.dto'

export class AddMemberDto {
  // Añadir un usuario existente al equipo: requiere userId.
  // Si no se pasa userId, se debe pasar name + lastName (ghost).
  @ValidateIf((dto) => !dto.name && !dto.lastName)
  @IsString()
  @IsNotEmpty({ message: 'userId es obligatorio si no se envía name + lastName' })
  userId?: string

  // Datos para crear un usuario ghost (isGhost = true)
  @ValidateIf((dto) => !dto.userId)
  @IsString()
  @IsNotEmpty({ message: 'name es obligatorio si no se envía userId' })
  name?: string

  @ValidateIf((dto) => !dto.userId)
  @IsString()
  @IsNotEmpty({ message: 'lastName es obligatorio si no se envía userId' })
  lastName?: string

  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsEnum(MembershipRole)
  role?: MembershipRole = MembershipRole.PLAYER

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  jerseyNumber?: number

  @IsOptional()
  @IsString()
  position?: string
}