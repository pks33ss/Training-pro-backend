# Sistema de roles y permisos

Documento de referencia del sistema de autorización de Training Pro.

> **Última actualización:** 2026-09-28
> **Estado:** vigente tras el refactor de roles (Bloques 1-10).

---

## 1. Visión general

El sistema de autorización se organiza en **tres ámbitos** independientes:

| Ámbito | Modelo | Cardinalidad | Rol |
|---|---|---|---|
| **Global** | `User.role` | 1 rol por user | `USER` \| `SUPER_ADMIN` |
| **Club** | `ClubMember.role` | 1 rol por user por club | `ADMIN_CLUB` \| `COACH` \| `ASSISTANT` \| `MEMBER` |
| **Equipo** | `MembershipRole.role` | **N roles por user por equipo** | `PLAYER` \| `COACH` \| `ASSISTANT` \| `ADMIN_TEAM` |

Reglas clave:

- Un user puede tener **varios roles a la vez** en un mismo equipo (ej. PLAYER + COACH).
- El rol de club **manda** sobre el rol de equipo cuando hay conflicto (ej. un COACH de equipo que además es ADMIN_CLUB del club → actúa como ADMIN_CLUB).
- **PARENT no es un rol.** Se deriva de `TutorRelationship` con `status = 'ACTIVE'` (el user es tutor activo de un jugador del equipo).
- **SUPER_ADMIN está por encima de todo.** Puede ver y gestionar cualquier club y equipo, aunque no sea miembro.
- Todos los chequeos viven en `backend/src/common/access.ts`. Es la **única fuente de verdad**.
- El frontend consume `GET /teams/:id/permissions/me` (que internamente usa `access.ts`) para decidir qué botones mostrar. Nunca decide por su cuenta.

---

## 2. Jerarquía

De mayor a menor poder:

SUPER_ADMIN
↓
ADMIN_CLUB (del club)
↓
ADMIN_TEAM (del equipo)
↓
COACH (del equipo)
↓
ASSISTANT (del equipo)
↓
PLAYER


---

## 3. Matriz de permisos

### 3.1 Ver / editar / eliminar equipo

| Acción | SUPER_ADMIN | ADMIN_CLUB | ADMIN_TEAM | COACH | ASSISTANT | PLAYER | PARENT |
|---|---|---|---|---|---|---|---|
| **Ver equipo** (`canViewTeam`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (si su hijo está en el equipo) |
| **Editar equipo** (`canEditTeam`) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Gestionar miembros** (`canManageMembers`) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Eliminar equipo** (`canDeleteTeam`) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

### 3.2 Quitar a alguien de un equipo (`canRemoveMember`)

Filas = actor. Columnas = rol del target.

| Actor ↓ \ Target → | PLAYER | ASSISTANT | COACH | ADMIN_TEAM |
|---|---|---|---|---|
| **SUPER_ADMIN** | ✅ | ✅ | ✅ | ✅ |
| **ADMIN_CLUB** | ✅ | ✅ | ✅ | ✅ |
| **ADMIN_TEAM** | ✅ | ✅ | ✅ | ✅ |
| **COACH** | ✅ | ✅ | ✅ | ❌ |
| **ASSISTANT** | ❌ | ❌ | ❌ | ❌ |
| **PLAYER** | ❌ | ❌ | ❌ | ❌ |

**Reglas adicionales:**

- Un user **siempre** puede quitarse a sí mismo (auto-salida).
- Si el target tiene **varios roles**, se aplica la regla más restrictiva: el actor debe poder quitar **todos** los roles del target.
  - Ejemplo: si el target es `COACH + ADMIN_TEAM`, un COACH no puede quitarlo (porque no puede quitar ADMIN_TEAM).
- **Regla del último COACH activo:** se permite quitar al último COACH. Al hacerlo, se notifica a los ADMIN_TEAM activos del equipo (o a los ADMIN_CLUB del club si no hay ADMIN_TEAM). **El equipo puede quedarse sin COACH** (decisión de diseño).
- Los roles se evalúan **por equipo**. Si un user es COACH del equipo A y ASSISTANT del equipo B, en B actúa como ASSISTANT.

### 3.3 Añadir/quitar roles individuales

Un miembro puede tener N roles en el mismo equipo. Estos son los permisos para **añadir o quitar un rol concreto**:

| Actor ↓ \ Rol → | PLAYER | ASSISTANT | COACH | ADMIN_TEAM |
|---|---|---|---|---|
| **SUPER_ADMIN** | ✅ | ✅ | ✅ | ✅ |
| **ADMIN_CLUB** | ✅ | ✅ | ✅ | ✅ |
| **ADMIN_TEAM** | ✅ | ✅ | ✅ | ✅ |
| **COACH** | ✅ | ✅ | ✅ | ❌ |
| **ASSISTANT** | ❌ | ❌ | ❌ | ❌ |
| **PLAYER** | ❌ | ❌ | ❌ | ❌ |

**Reglas adicionales:**

- Cualquier user puede gestionarse **sus propios roles** (siempre que no se quede sin ninguno).
- Si al quitar un rol el user se queda **sin ningún rol**, la membership pasa a `LEFT` (equivale a salir del equipo) y se sincroniza el `ClubMember` (auto-desvincular del club si no le quedan memberships).
- Los roles se pueden gestionar por endpoint individual (`POST /memberships/:id/roles`, `DELETE /memberships/:id/roles/:role`).

### 3.4 Invitar

| Acción | SUPER_ADMIN | ADMIN_CLUB | ADMIN_TEAM | COACH | ASSISTANT | PLAYER |
|---|---|---|---|---|---|---|
| **Invitar a un equipo** (`canInviteToTeam`) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Invitar al club** (`canInviteToClub`) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### 3.5 Ver datos privados de un user (`canViewUserPrivateData`)

Puede ver email, phone, bio, etc.:

- El propio user.
- SUPER_ADMIN.
- ADMIN_CLUB de un club compartido.
- COACH / ASSISTANT / ADMIN_TEAM de un equipo compartido.
- PARENT activo del user (vía `TutorRelationship`).

### 3.6 Editar / eliminar users

| Acción | Propio user | SUPER_ADMIN | Otros |
|---|---|---|---|
| **Editar perfil** (`canEditUser`) | ✅ | ✅ | ❌ |
| **Eliminar cuenta** (`canDeleteUser`) | ✅ (auto) | ✅ | ❌ |

### 3.7 Editar datos de un ghost (`canEditGhost`)

Un **ghost** es un user sin cuenta real (`isGhost: true`, sin password). Se crea desde un equipo para representar a un jugador que aún no se ha registrado.

| Actor | ¿Puede editar datos del ghost? |
|---|---|
| SUPER_ADMIN | ✅ |
| ADMIN_CLUB del club del ghost | ✅ |
| COACH / ASSISTANT / ADMIN_TEAM de un equipo del ghost | ✅ |
| Otros | ❌ |

Los campos editables son: `name`, `lastName`, `phone`, `email`, `bio`.

**Un user real (isGhost: false) NO se puede editar desde aquí.** Solo el propio user desde `/profile`.

---

## 4. Ámbito club

### 4.1 Roles

| Rol | Quién lo asigna | Qué puede |
|---|---|---|
| `ADMIN_CLUB` | Otro ADMIN_CLUB / SUPER_ADMIN | Todo dentro del club (equipos, miembros, invitaciones al club, borrar club). |
| `COACH` | ADMIN_CLUB | Gestionar los equipos donde tenga rol de equipo. |
| `ASSISTANT` | ADMIN_CLUB | Igual que COACH pero no puede invitar al club. |
| `MEMBER` | Sistema (auto-vinculación al entrar a un equipo) | Solo ver. |

### 4.2 Invariantes

- Un club **siempre** tiene ≥1 `ADMIN_CLUB`.
- Un `ADMIN_CLUB` **no se auto-desvincula** del club al perder sus equipos.
- Un user se auto-vincula al club (`role: MEMBER`) cuando entra a un equipo (`ensureClubMemberForTeam`).

### 4.3 Auto-desvincular del club

Cuando un user se queda **sin memberships activas** en ningún equipo del club:

1. Su `ClubMember.isActive` pasa a `false` (reversible).
2. **Excepción:** si es `ADMIN_CLUB`, se mantiene activo.

Esto ocurre automáticamente tras cada `leave()` de un equipo (`syncClubMembershipAfterLeave`).

### 4.4 Expulsar del club (acción explícita)

Un ADMIN_CLUB (o SUPER_ADMIN) puede **expulsar del club** a un miembro desde `/clubs/:id/members`. Esta acción:

1. Pone **todas las memberships activas** del user en ese club a `LEFT`.
2. Borra su `ClubMember`.

**Nota:** el auto-desvincular del club (4.3) es un efecto colateral; la expulsión (4.4) es una acción explícita.

### 4.5 Gestionar equipos de un miembro

Un ADMIN_CLUB puede **asignar/desasignar** a un miembro a los equipos del club desde `/clubs/:id/members` (botón 🏀). Al asignar, se crea una `TeamMembership` con `role: COACH`.

---

## 5. Ámbito equipo

### 5.1 Modelo `MembershipRole`

Un user puede tener **varios roles** en el mismo equipo. Se modela con la tabla `MembershipRole`:

```prisma
model MembershipRole {
  id           String             @id @default(cuid())
  membershipId String
  role         MembershipRoleType
  createdAt    DateTime           @default(now())

  membership TeamMembership @relation(fields: [membershipId], references: [id], onDelete: Cascade)

  @@unique([membershipId, role])
}