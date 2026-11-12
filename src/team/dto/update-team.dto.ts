import { PartialType } from '@nestjs/mapped-types';
import { CreateTeamDto } from './create-team.dto';

// UpdateTeamDto hereda `licenseType` de CreateTeamDto vía PartialType.
// El service se encarga de que solo el SUPER_ADMIN pueda aplicarlo.
export class UpdateTeamDto extends PartialType(CreateTeamDto) {}