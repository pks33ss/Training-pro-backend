// backend/src/live-events/dto/create-match-event.dto.ts

import { IsEnum, IsOptional, IsString } from 'class-validator'
import { MatchEventType } from '@prisma/client'

/**
 * Crear un evento de un partido en vivo.
 *
 * Reglas:
 *  - Exactamente uno de `playerId` (nuestro) o `opponentPlayerId` (rival).
 *  - `isOpponent` NO se pide al cliente: se deriva de cuál de los dos
 *    campos viene. Si envían ambos o ninguno → 400.
 *  - `value` opcional; en el MVP no se usa (los tipos ya llevan implícito su valor).
 */
export class CreateMatchEventDto {
  @IsEnum(MatchEventType)
  type: MatchEventType

  @IsOptional()
  @IsString()
  playerId?: string

  @IsOptional()
  @IsString()
  opponentPlayerId?: string
}