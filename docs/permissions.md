# Permisos y derechos por rol

> Estado: **vigente desde Lote 8 (8.0–8.5)**.
> `access.ts` sigue vivo como motor legacy hasta 8.7, tras lo cual se retira.
> Fuente de verdad de los recursos, acciones y precedencia.

## 1. Visión general

La autorización se expresa como una **matriz de permisos por rol**:

- **Rol** (`Role`): entidad con `scope = CLUB | TEAM`, creada por club.
- **Permiso** (`RolePermission`): fila `(roleId, resource, action, scope?)`.
- **Resolución** (`PermissionsService`): dado `(userId, clubId | teamId, resource, action)`,
  devuelve allow/deny aplicando precedencia.
- **Reglas de negocio** (`TeamPolicyService`): reglas que NO son permisos puros
  (último COACH, restrictiva con multi-rol, auto-salida).

Durante 8.x conviven dos motores según `PERMISSIONS_ENGINE`:

- `access` (DEFAULT): lógica legacy, comportamiento actual.
- `matrix`: nuevo motor basado en la matriz.

En 8.7 se retira el flag y `access.ts` queda como thin wrapper sobre `PermissionsService`.

## 2. Ámbitos y roles de sistema

| Ámbito | Modelo | Roles de sistema |
|---|---|---|
| Global | `User.role` (enum) | `SUPER_ADMIN`, `USER` |
| Club | `ClubMember.roleId → Role(scope=CLUB)` | ver lista abajo |
| Equipo | `MembershipRole.roleId → Role(scope=TEAM)` | ver lista abajo |

### Roles de CLUB (9)

| Nombre | Descripción | ¿Editable? | ¿Default? |
|---|---|---|---|
| ADMIN_CLUB | Administrador del club (bypass total) | ❌ (bypass) | ❌ |
| DIRECTOR_DEPORTIVO | Dirección deportiva del club | ✅ | ❌ |
| COORDINADOR | Coordina todas las categorías del club | ✅ | ❌ |
| COACH | Entrenador del club | ✅ | ❌ |
| ASSISTANT | Entrenador ayudante del club | ✅ | ❌ |
| OJEADOR | Solo lectura de perfiles y estadísticas | ✅ | ❌ |
| SECRETARIO | Documentación y altas/bajas | ✅ | ❌ |
| TESORERO | Gestiona pagos y cuotas del club | ✅ | ❌ |
| MEMBER | Miembro del club | ✅ | ✅ |

### Roles de EQUIPO (7)

| Nombre | Descripción | ¿Editable? | ¿Default? |
|---|---|---|---|
| ADMIN_TEAM | Administrador de equipo | ✅ | ❌ |
| COACH | Entrenador de equipo | ✅ | ❌ |
| ASSISTANT | Entrenador ayudante de equipo | ✅ | ❌ |
| DELEGADO | Logística del equipo | ✅ | ❌ |
| PLAYER | Jugador | ✅ | ✅ |
| ENTRENADOR_VISITANTE | Ve el equipo sin poder editar | ✅ | ❌ |
| FISIO | Fisioterapeuta del equipo | ✅ | ❌ |

Reglas:

- `SUPER_ADMIN` está por encima de todo (bypass en `PermissionsService`).
- `ADMIN_CLUB` tiene bypass total y **no se siembra en `RolePermission`**.
- Un user puede tener **varios roles de equipo** simultáneos (`MembershipRole`).
- El rol de club **manda** sobre el de equipo en conflicto.
- `PARENT` **no es un rol**: se deriva de `TutorRelationship` con `status = ACTIVE`.
- Los **roles de sistema no son renombrables**, pero **sus permisos SÍ son editables**
  desde la UI (es el propósito de la matriz). El nombre queda bloqueado para no
  romper referencias.

## 3. Recursos y acciones

Acciones por recurso: `view`, `create`, `edit`, `delete` (subconjunto según recurso).

| Recurso | Acciones | Etiqueta |
|---|---|---|
| team | view, create, edit, delete | Equipos |
| member | view, create, edit, delete | Miembros |
| invitation | view, create, delete | Invitaciones |
| membership_role | view, create, delete | Roles de equipo |
| payment | view, create, edit, delete | Pagos |
| event | view, create, edit, delete | Eventos |
| document | view, create, edit, delete | Documentos |
| club_settings | view, edit | Configuración del club |
| club_branding | view, edit | Branding |
| report | view | Reportes |
| role_admin | view, create, edit, delete | Gestión de roles |
| player_profile | view, edit | Perfiles de jugador |
| stats_config | view, edit | Configuración de estadísticas |
| user_private_data | view | Datos privados de usuarios |
| ghost_edit | edit | Edición de ghosts |

## 4. Precedencia (resolución)

Dado un actor `A`, un recurso `R`, una acción `X` y opcionalmente un `teamId`:

1. `A.role === SUPER_ADMIN` → **allow**.
2. `A.ClubMember(club).role.name === ADMIN_CLUB` → **allow**.
3. Cargar permisos del rol de club de `A`:
   - si existe fila `(roleId, R, X, scope="team:<teamId>")` → gana ese `granted`.
   - si existe fila `(roleId, R, X, scope=null)` → gana ese `granted`.
4. Si no hay fila y hay `teamId`, cargar permisos del rol de equipo de `A` en ese equipo:
   - misma precedencia `scope específico > scope club`.
5. Si sigue sin haber fila → **deny**.

Precedencia entre fuentes: **club > equipo**, **scope específico > scope club**,
**deny explícito > allow**.

## 5. Defaults sin rol

Un `ClubMember` siempre tiene `roleId`. El rol `MEMBER` se siembra con permisos
mínimos: `view` en recursos públicos del club (`team`, `member`, `event`,
`document`, `club_settings`, `club_branding`).

## 6. Auditoría

Cada cambio en `Role` o `RolePermission` se registra en `PermissionAuditLog`
(actor, target, action, before, after).

## 7. Reglas de negocio fuera de la matriz

`TeamPolicyService` implementa, fuera de la matriz:

- **Último COACH activo**: al quitar al último, notificar a ADMIN_TEAM del equipo
  (o ADMIN_CLUB del club si no hay ADMIN_TEAM). El equipo puede quedarse sin COACH.
- **Restrictiva con multi-rol**: para `removeMember`, el actor debe poder quitar
  **todos** los roles del target.
- **Auto-salida**: un user siempre puede quitarse a sí mismo.
- **Auto-desvincular del club**: al quedarse sin memberships activas,
  `ClubMember.isActive = false` (excepto si es ADMIN_CLUB).
- **Auto-vinculación al club**: al entrar a un equipo, si no había `ClubMember`,
  se crea con el rol `MEMBER` del club.

## 8. Normas

- No se modifica `auth.guard.ts`.
- `access.ts` se reescribe **entero** con las **mismas firmas exportadas**, delegando
  en `PermissionsService` cuando `PERMISSIONS_ENGINE = 'matrix'`.
- El frontend consume `GET /teams/:id/permissions/me` con la **misma forma** de JSON.

## 9. Compatibilidad y rollback

Durante Lotes 8.1–8.6 conviven dos motores:

- `PERMISSIONS_ENGINE=access` → usa la lógica heredada (pre-migración).
- `PERMISSIONS_ENGINE=matrix` → usa `PermissionsService`.

En 8.7 se retira la variable y el motor heredado.

## 10. Endpoints de la matriz

| Método | Ruta | Para qué |
|---|---|---|
| GET | `/clubs/:clubId/roles` | Lista roles del club |
| GET | `/clubs/:clubId/roles/:roleId` | Detalle de un rol |
| POST | `/clubs/:clubId/roles` | Crear rol custom |
| PUT | `/clubs/:clubId/roles/:roleId` | Editar nombre/descripción (no renombra de sistema) |
| DELETE | `/clubs/:clubId/roles/:roleId` | Borrar rol (solo custom y sin uso) |
| PUT | `/clubs/:clubId/roles/:roleId/permissions` | Set bulk de permisos |
| POST | `/clubs/:clubId/roles/:roleId/preview-impact` | Preview de impacto |
| GET | `/clubs/:clubId/permissions/me` | Permisos efectivos del usuario actual |

## 11. UI

- `/settings/permissions` — hub con 2 tarjetas (matriz + visibilidad stats).
- `/settings/permissions/roles` — matriz editable de roles y permisos.
- `/settings/permissions/stats` — visibilidad de estadísticas por equipo activo.
- El hub se muestra **dentro del tab "Permisos"** de `/settings` y también por URL directa.
- El tab "Permisos" aparece solo si el usuario pertenece a algún club.
- La matriz es editable por cualquier ADMIN_CLUB del club.
- El rol ADMIN_CLUB se muestra con 👑 y matriz deshabilitada.
- El preview de impacto se puede consultar antes de guardar.

## 12. Pendiente (8.6–8.7)

- 8.6: hook `usePermissions` extendido y gating visual en el frontend.
- 8.7: retirar `PERMISSIONS_ENGINE`, borrar enums legacy `ClubRole` y
  `MembershipRoleType`, migrar `PendingInvitation.role`, tests unitarios,
  eliminar `ProfilePermissionsTab`.