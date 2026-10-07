import { PartialType } from '@nestjs/mapped-types';
import { CreateLibraryExerciseDto } from './create-library-exercise.dto';

export class UpdateLibraryExerciseDto extends PartialType(CreateLibraryExerciseDto) {}