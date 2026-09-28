# Sistema de roles y permisos

Documento de referencia del sistema de autorización de Training Pro.

> **Última actualización:** 2026-09-28
> **Estado:** vigente tras el refactor de roles (Fases 1-7).

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
- Todos los chequeos viven en `backend/src/common/access.ts`. Es la **única fuente de verdad**.
- El frontend consume `GET /teams/:id/permissions/me` (que internamente usa `access.ts`) para decidir qué botones mostrar. Nunca decide por su cuenta.

---

## 2. Jerarquía

De mayor a menor poder:
