# Módulo de Pagos de Membresías

## Objetivo
Controlar quién ha pagado las cuotas de membresía, cuánto, cuándo y por qué concepto.
Vista de un golpe de ojo del estado de cobro por equipo/club.

## Alcance V1 (Nivel 1)
- Conceptos de pago **puntuales**.
- Asignación a **todo el equipo** al crear el concepto.
- Importe **igual para todos** los jugadores del equipo.
- Pagos **parciales** permitidos.
- Pagador = **User** (jugador). Tutores → futuro.
- Permisos: **COACH para arriba**.
- Justificante en **Cloudinary**.
- Recordatorios email: campo reservado, **desactivado por defecto**.

## Modelo de datos

### PaymentConcept
El "qué". Ej: "Cuota octubre 2026", "Equipación", "Torneo navidad".
- `clubId` (siempre)
- `teamId` (null = concepto a nivel club)
- `amount` (importe por jugador)
- `dueDate`
- `season` (string, formato "2026-27")
- `emailRemindersEnabled` (default false)

### PaymentAssignment
"Este jugador debe este concepto". Se genera automáticamente al crear el concepto
para todos los jugadores activos del equipo. `amountOwed = concept.amount` en V1.

### Payment
El "quién ha pagado". Puede haber varios pagos por (concepto, jugador) → pagos parciales.

## Estados (derivados, no en BD)

Para cada par (conceptId, userId):
- owed = assignment.amountOwed
- paid = sum(payments.amount)
- PAID si paid >= owed
- PARTIAL si 0 < paid < owed
- OVERDUE si paid == 0 && dueDate < now
- PENDING si paid == 0 && dueDate >= now

## Permisos
- COACH: ver y gestionar pagos de sus equipos.
- ADMIN_CLUB: ver y gestionar todos los pagos del club.
- ADMIN: todo.
- PLAYER: solo los suyos (V1.1).

## Temporada
String "2026-27" (coherente con Match.season). Pendiente normalización global.

## Futuro (Nivel 2/3)
- Asignación selectiva de jugadores.
- Importes por jugador (becas/descuentos).
- Cuotas recurrentes con cron.
- Recordatorios email automáticos.
- Recibo PDF.
- Pagos que cubren varios conceptos (PaymentAllocation).
- Tutores/familia como pagadores.
- Integración Stripe/Redsys.