import { IsNumber, Min } from 'class-validator';

export class UpdateAssignmentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amountOwed: number;
}