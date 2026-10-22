// backend/src/live-events/dto/update-live-clock.dto.ts

import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator'

/**
 * Actualizar el reloj / periodo de una StatSession.
 * Todos los campos son opcionales; solo se actualizan los enviados.
 *
 * - `clockSeconds`: segundos restantes (DOWN) o transcurridos (UP). 0..10800 (3h).
 * - `clockRunning`: arranca o para.
 * - `currentPeriod`: 1..20 (suficiente para 4 cuartos + prórrogas).
 * - `clockStartedAt`: fecha de arranque del reloj (para calcular on-the-fly).
 *   En la práctica el backend lo ajusta al activar `clockRunning`, pero
 *   lo dejamos opcional por si el anotador quiere corregir.
 */
export class UpdateLiveClockDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10800)
  clockSeconds?: number

  @IsOptional()
  @IsBoolean()
  clockRunning?: boolean

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  currentPeriod?: number
}