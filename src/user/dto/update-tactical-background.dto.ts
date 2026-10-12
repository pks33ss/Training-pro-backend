import { IsIn, IsOptional, IsString, ValidateIf } from 'class-validator';

export class UpdateTacticalBackgroundDto {
  /**
   * URL de la imagen personalizada.
   * - `null` → resetear a la imagen por defecto del sistema.
   * - string → usar esa URL.
   * - undefined → no cambiar la URL, solo el modo.
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  url?: string | null;

  /**
   * Modo de pista.
   * - 'HALF' → media pista (cuadrado)
   * - 'FULL' → pista completa (rectangular)
   */
  @IsOptional()
  @IsIn(['HALF', 'FULL'])
  mode?: 'HALF' | 'FULL';
}