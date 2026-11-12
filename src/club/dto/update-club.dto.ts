import { PartialType } from '@nestjs/mapped-types';
import { CreateClubDto } from './create-club.dto';

// UpdateClubDto hereda `licenseType` de CreateClubDto vía PartialType.
// El service se encarga de que solo el SUPER_ADMIN pueda aplicarlo.
export class UpdateClubDto extends PartialType(CreateClubDto) {}