import { IsString, IsOptional, IsEnum, IsNotEmpty } from 'class-validator';

export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  LATE = 'LATE',
  EXCUSED = 'EXCUSED',
}

export class UpdateAttendanceDto {
  @IsEnum(AttendanceStatus)
  @IsNotEmpty()
  status: AttendanceStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class BulkAttendanceDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  // ✅ cambiado: ahora es userId en lugar de playerId
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsEnum(AttendanceStatus)
  @IsNotEmpty()
  status: AttendanceStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}