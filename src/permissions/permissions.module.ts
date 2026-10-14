// backend/src/permissions/permissions.module.ts
// Lote 8.4 — Módulo de permisos. @Global.

import { Global, Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { PermissionsService } from './permissions.service'
import { TeamPolicyService } from './team-policy.service'
import { RolesService } from './roles.service'
import { PermissionsGuard } from './permissions.guard'
import { RolesController } from './roles.controller'
import { PermissionsController } from './permissions.controller'

@Global()
@Module({
  imports: [AuthModule],
  controllers: [RolesController, PermissionsController],
  providers: [
    PermissionsService,
    TeamPolicyService,
    RolesService,
    PermissionsGuard,
  ],
  exports: [
    PermissionsService,
    TeamPolicyService,
    RolesService,
    PermissionsGuard,
  ],
})
export class PermissionsModule {}