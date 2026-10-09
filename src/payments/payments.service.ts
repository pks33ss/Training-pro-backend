import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { MailService } from '../mail/mail.service';
import {
  canViewTeam,
  canEditTeam,
  canManageClubPayments,
  canViewPaymentConcept,
  canManagePaymentConcept,
  canViewPaymentsSummary,
  canDeletePayment,
  assertCanViewPaymentConcept,
  assertCanManagePaymentConcept,
  isSuperAdmin,
} from '../common/access';
import { CreateConceptDto } from './dto/create-concept.dto';
import { UpdateConceptDto } from './dto/update-concept.dto';
import { ListConceptsDto } from './dto/list-concepts.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { SummaryQueryDto } from './dto/summary-query.dto';
import { RunRemindersDto } from './dto/run-reminders.dto';

import {
  generateReceiptPdf,
  type PaymentReceiptData,
} from './pdf/payment-receipt';

export type ConceptPlayerStatus =
  | 'PAID'
  | 'PARTIAL'
  | 'PENDING'
  | 'OVERDUE';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
    private mail: MailService,
  ) {}

  // ─────────────────────────────────────────────
  // CÁLCULO DE ESTADO
  // ─────────────────────────────────────────────

  private computeStatus(
    paid: number,
    owed: number,
    dueDate: Date,
    now: Date = new Date(),
  ): ConceptPlayerStatus {
    if (owed === 0) return 'PAID';
if (paid >= owed) return 'PAID';
if (paid > 0 && paid < owed) return 'PARTIAL';
if (paid === 0 && dueDate < now) return 'OVERDUE';
return 'PENDING';
  }

  // ─────────────────────────────────────────────
  // CONCEPTOS — CRUD
  // ─────────────────────────────────────────────

  async createConcept(userId: string, dto: CreateConceptDto) {
    const club = await this.prisma.club.findUnique({
      where: { id: dto.clubId },
      select: { id: true },
    });
    if (!club) throw new NotFoundException('Club no encontrado');

    if (dto.teamId) {
      const team = await this.prisma.team.findUnique({
        where: { id: dto.teamId },
        select: { id: true, clubId: true },
      });
      if (!team) throw new NotFoundException('Equipo no encontrado');
      if (team.clubId !== dto.clubId) {
        throw new BadRequestException('El equipo no pertenece a ese club');
      }
    }

    await assertCanManagePaymentConcept(this.prisma, userId, {
      clubId: dto.clubId,
      teamId: dto.teamId ?? null,
    });

    const assignmentMode =
      dto.assignmentMode ?? (dto.teamId ? 'ALL_TEAM' : 'NONE');
    if (assignmentMode === 'ALL_TEAM' && !dto.teamId) {
      throw new BadRequestException('assignmentMode ALL_TEAM requiere teamId');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const concept = await tx.paymentConcept.create({
        data: {
          clubId: dto.clubId,
          teamId: dto.teamId ?? null,
          name: dto.name,
          description: dto.description,
          amount: dto.amount,
          dueDate: new Date(dto.dueDate),
          season: dto.season,
          isRecurring: dto.isRecurring ?? false,
          emailRemindersEnabled: dto.emailRemindersEnabled ?? false,
          reminderDaysBefore: dto.reminderDaysBefore ?? 3,
          createdById: userId,
        },
      });

      if (assignmentMode === 'ALL_TEAM' && dto.teamId) {
        const memberships = await tx.teamMembership.findMany({
          where: {
            teamId: dto.teamId,
            status: 'ACTIVE',
            roles: { some: { role: 'PLAYER' } },
          },
          select: { userId: true },
        });

        if (memberships.length > 0) {
          await tx.paymentAssignment.createMany({
            data: memberships.map((m) => ({
              conceptId: concept.id,
              userId: m.userId,
              amountOwed: dto.amount,
            })),
            skipDuplicates: true,
          });
        }
      }

      return concept;
    });

    return this.getConceptDetail(userId, created.id);
  }

  async listConcepts(userId: string, filters: ListConceptsDto) {
    if (!filters.clubId && !filters.teamId) {
      throw new BadRequestException('Debes indicar clubId o teamId');
    }

    if (filters.teamId) {
      if (!(await canViewTeam(this.prisma, userId, filters.teamId))) {
        throw new ForbiddenException('No tienes acceso a este equipo');
      }
    } else if (filters.clubId) {
      const canView =
        (await canViewPaymentsSummary(this.prisma, userId, {
          clubId: filters.clubId,
        })) || (await canManageClubPayments(this.prisma, userId, filters.clubId));
      if (!canView) {
        throw new ForbiddenException('No tienes acceso a este club');
      }
    }

    const where: any = {};
    if (filters.clubId) where.clubId = filters.clubId;
    if (filters.teamId) where.teamId = filters.teamId;
    if (filters.season) where.season = filters.season;

    const concepts = await this.prisma.paymentConcept.findMany({
      where,
      orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        _count: { select: { assignments: true } },
        team: { select: { id: true, name: true } },
      },
    });

    const now = new Date();

    return Promise.all(
      concepts.map(async (c) => {
        const payments = await this.prisma.payment.findMany({
          where: { conceptId: c.id },
          select: { userId: true, amount: true },
        });

        const paidByUser = new Map<string, number>();
        for (const p of payments) {
          paidByUser.set(
            p.userId,
            (paidByUser.get(p.userId) ?? 0) + Number(p.amount),
          );
        }

        const assignments = await this.prisma.paymentAssignment.findMany({
          where: { conceptId: c.id },
          select: { userId: true, amountOwed: true },
        });

        let paidCount = 0;
        let partialCount = 0;
        let pendingCount = 0;
        let overdueCount = 0;
        let totalOwed = 0;
        let totalPaid = 0;

        for (const a of assignments) {
          const paid = paidByUser.get(a.userId) ?? 0;
          const owed = Number(a.amountOwed);
          totalOwed += owed;
          totalPaid += paid;

          const status = this.computeStatus(paid, owed, c.dueDate, now);
          if (status === 'PAID') paidCount++;
          else if (status === 'PARTIAL') partialCount++;
          else if (status === 'OVERDUE') overdueCount++;
          else pendingCount++;
        }

        return {
          id: c.id,
          clubId: c.clubId,
          teamId: c.teamId,
          team: c.team,
          name: c.name,
          description: c.description,
          amount: Number(c.amount),
          dueDate: c.dueDate,
          season: c.season,
          isRecurring: c.isRecurring,
          emailRemindersEnabled: c.emailRemindersEnabled,
          reminderDaysBefore: c.reminderDaysBefore,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          stats: {
            totalAssignments: c._count.assignments,
            totalOwed,
            totalPaid,
            totalRemaining: Math.max(0, totalOwed - totalPaid),
            paidCount,
            partialCount,
            pendingCount,
            overdueCount,
          },
        };
      }),
    );
  }

  async getConceptDetail(userId: string, conceptId: string) {
    const concept = await this.prisma.paymentConcept.findUnique({
      where: { id: conceptId },
      include: {
        team: { select: { id: true, name: true } },
        club: { select: { id: true, name: true } },
      },
    });

    if (!concept) throw new NotFoundException('Concepto no encontrado');

    await assertCanViewPaymentConcept(this.prisma, userId, {
      clubId: concept.clubId,
      teamId: concept.teamId,
    });

    const assignments = await this.prisma.paymentAssignment.findMany({
      where: { conceptId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            lastName: true,
            avatar: true,
            email: true,
          },
        },
      },
      orderBy: [{ user: { lastName: 'asc' } }, { user: { name: 'asc' } }],
    });

    const payments = await this.prisma.payment.findMany({
      where: { conceptId },
      select: {
        id: true,
        userId: true,
        amount: true,
        paidAt: true,
        method: true,
        notes: true,
        receiptUrl: true,
        createdAt: true,
      },
      orderBy: { paidAt: 'desc' },
    });

    const paymentsByUser = new Map<string, typeof payments>();
    for (const p of payments) {
      const arr = paymentsByUser.get(p.userId) ?? [];
      arr.push(p);
      paymentsByUser.set(p.userId, arr);
    }

    // Recordatorios enviados, agrupados por userId
    const reminders = await this.prisma.paymentReminder.findMany({
      where: { conceptId },
      select: {
        id: true,
        userId: true,
        type: true,
        sentAt: true,
      },
      orderBy: { sentAt: 'desc' },
    });

    const remindersByUser = new Map<string, typeof reminders>();
    for (const r of reminders) {
      const arr = remindersByUser.get(r.userId) ?? [];
      arr.push(r);
      remindersByUser.set(r.userId, arr);
    }

    const now = new Date();

    const players = assignments.map((a) => {
      const userPayments = paymentsByUser.get(a.userId) ?? [];
      const paid = userPayments.reduce((s, p) => s + Number(p.amount), 0);
      const owed = Number(a.amountOwed);
      const status = this.computeStatus(paid, owed, concept.dueDate, now);

      return {
        userId: a.userId,
        user: a.user,
        amountOwed: owed,
        amountPaid: paid,
        amountRemaining: Math.max(0, owed - paid),
        status,
        payments: userPayments.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          paidAt: p.paidAt,
          method: p.method,
          notes: p.notes,
          receiptUrl: p.receiptUrl,
          createdAt: p.createdAt,
        })),
        reminders: (remindersByUser.get(a.userId) ?? []).map((r) => ({
          id: r.id,
          type: r.type,
          sentAt: r.sentAt,
        })),
      };
    });

    const totalOwed = players.reduce((s, p) => s + p.amountOwed, 0);
    const totalPaid = players.reduce((s, p) => s + p.amountPaid, 0);

    let unassignedPlayers: Array<{
      userId: string;
      user: {
        id: string;
        name: string;
        lastName: string;
        avatar: string | null;
        email: string | null;
      };
    }> = [];

    if (concept.teamId) {
      const assignedIds = new Set(assignments.map((a) => a.userId));
      const teamPlayers = await this.prisma.teamMembership.findMany({
        where: {
          teamId: concept.teamId,
          status: 'ACTIVE',
          roles: { some: { role: 'PLAYER' } },
        },
        select: {
          userId: true,
          user: {
            select: {
              id: true,
              name: true,
              lastName: true,
              avatar: true,
              email: true,
            },
          },
        },
        orderBy: [
          { user: { lastName: 'asc' } },
          { user: { name: 'asc' } },
        ],
      });

      unassignedPlayers = teamPlayers
        .filter((m) => !assignedIds.has(m.userId))
        .map((m) => ({ userId: m.userId, user: m.user }));
    }

    return {
      id: concept.id,
      clubId: concept.clubId,
      club: concept.club,
      teamId: concept.teamId,
      team: concept.team,
      name: concept.name,
      description: concept.description,
      amount: Number(concept.amount),
      dueDate: concept.dueDate,
      season: concept.season,
      isRecurring: concept.isRecurring,
      emailRemindersEnabled: concept.emailRemindersEnabled,
      reminderDaysBefore: concept.reminderDaysBefore,
      createdAt: concept.createdAt,
      updatedAt: concept.updatedAt,
      stats: {
        totalAssignments: players.length,
        totalOwed,
        totalPaid,
        totalRemaining: Math.max(0, totalOwed - totalPaid),
        paidCount: players.filter((p) => p.status === 'PAID').length,
        partialCount: players.filter((p) => p.status === 'PARTIAL').length,
        pendingCount: players.filter((p) => p.status === 'PENDING').length,
        overdueCount: players.filter((p) => p.status === 'OVERDUE').length,
      },
      players,
      unassignedPlayers,
    };
  }

  async updateConcept(
    userId: string,
    conceptId: string,
    dto: UpdateConceptDto,
  ) {
    const concept = await this.prisma.paymentConcept.findUnique({
      where: { id: conceptId },
    });
    if (!concept) throw new NotFoundException('Concepto no encontrado');

    await assertCanManagePaymentConcept(this.prisma, userId, {
      clubId: concept.clubId,
      teamId: concept.teamId,
    });

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.amount !== undefined) data.amount = dto.amount;
    if (dto.dueDate !== undefined) data.dueDate = new Date(dto.dueDate);
    if (dto.season !== undefined) data.season = dto.season;
    if (dto.isRecurring !== undefined) data.isRecurring = dto.isRecurring;
    if (dto.emailRemindersEnabled !== undefined) {
      data.emailRemindersEnabled = dto.emailRemindersEnabled;
    }
    if (dto.reminderDaysBefore !== undefined) {
      data.reminderDaysBefore = dto.reminderDaysBefore;
    }

    const amountChanged =
      dto.amount !== undefined && Number(dto.amount) !== Number(concept.amount);

    const updated = await this.prisma.$transaction(async (tx) => {
      const c = await tx.paymentConcept.update({
        where: { id: conceptId },
        data,
      });

      if (amountChanged) {
        const paidUsers = await tx.payment.findMany({
          where: { conceptId },
          select: { userId: true },
          distinct: ['userId'],
        });
        const paidUserIds = paidUsers.map((p) => p.userId);

        await tx.paymentAssignment.updateMany({
          where: {
            conceptId,
            ...(paidUserIds.length > 0
              ? { userId: { notIn: paidUserIds } }
              : {}),
          },
          data: { amountOwed: dto.amount! },
        });
      }

      return c;
    });

    return this.getConceptDetail(userId, updated.id);
  }

  async deleteConcept(userId: string, conceptId: string) {
    const concept = await this.prisma.paymentConcept.findUnique({
      where: { id: conceptId },
      include: { _count: { select: { payments: true } } },
    });
    if (!concept) throw new NotFoundException('Concepto no encontrado');

    await assertCanManagePaymentConcept(this.prisma, userId, {
      clubId: concept.clubId,
      teamId: concept.teamId,
    });

    if (concept._count.payments > 0) {
      throw new BadRequestException(
        'No se puede eliminar un concepto que ya tiene pagos registrados. Elimina primero los pagos.',
      );
    }

    await this.prisma.paymentConcept.delete({ where: { id: conceptId } });
    return { success: true };
  }

  // ─────────────────────────────────────────────
  // PAGOS
  // ─────────────────────────────────────────────

  async createPayment(userId: string, dto: CreatePaymentDto) {
    const concept = await this.prisma.paymentConcept.findUnique({
      where: { id: dto.conceptId },
      select: { id: true, clubId: true, teamId: true, dueDate: true },
    });
    if (!concept) throw new NotFoundException('Concepto no encontrado');

    await assertCanManagePaymentConcept(this.prisma, userId, {
      clubId: concept.clubId,
      teamId: concept.teamId,
    });

    const assignment = await this.prisma.paymentAssignment.findUnique({
      where: {
        conceptId_userId: { conceptId: dto.conceptId, userId: dto.userId },
      },
    });
    if (!assignment) {
      throw new BadRequestException(
        'El jugador no está asignado a este concepto. Asígnalo primero.',
      );
    }

    const createdPayment = await this.prisma.payment.create({
      data: {
        conceptId: dto.conceptId,
        userId: dto.userId,
        amount: dto.amount,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        method: dto.method,
        notes: dto.notes,
        receiptUrl: dto.receiptUrl,
        createdById: userId,
      },
    });

    // Fire-and-forget: enviar email de confirmación al jugador.
    void this.sendPaymentReceivedNotification(createdPayment.id);

    return this.getConceptDetail(userId, dto.conceptId);
  }

  async deletePayment(userId: string, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, conceptId: true },
    });
    if (!payment) throw new NotFoundException('Pago no encontrado');

    const allowed = await canDeletePayment(this.prisma, userId, paymentId);
    if (!allowed) {
      throw new ForbiddenException('No tienes permisos para borrar este pago');
    }

    await this.prisma.payment.delete({ where: { id: paymentId } });

    return this.getConceptDetail(userId, payment.conceptId);
  }

  // ─────────────────────────────────────────────
  // EMAIL AL REGISTRAR PAGO
  // ─────────────────────────────────────────────

  /**
   * Envía al jugador un email confirmando el pago.
   * - Fire-and-forget.
   * - Solo si el jugador tiene email real y prefs OK.
   */
  private async sendPaymentReceivedNotification(paymentId: string) {
    try {
      const payment = await this.prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              lastName: true,
              email: true,
              emailNotificationsEnabled: true,
              emailOptOut: true,
            },
          },
          concept: {
            include: {
              team: { select: { id: true, name: true } },
              club: { select: { id: true, name: true } },
            },
          },
        },
      });

      if (!payment) {
        this.logger.warn(
          `sendPaymentReceivedNotification: payment ${paymentId} no encontrado`,
        );
        return;
      }

      const { user, concept } = payment;

      if (!user.emailNotificationsEnabled || user.emailOptOut) {
        this.logger.debug(
          `Email de pago recibido no enviado a ${user.email}: prefs del usuario`,
        );
        return;
      }

      if (!this.mail.isRealEmail(user.email)) {
        this.logger.debug(
          `Email de pago recibido no enviado a ${user.email}: email no válido`,
        );
        return;
      }

      const [assignment, allPayments] = await Promise.all([
        this.prisma.paymentAssignment.findUnique({
          where: {
            conceptId_userId: {
              conceptId: concept.id,
              userId: user.id,
            },
          },
        }),
        this.prisma.payment.findMany({
          where: { conceptId: concept.id, userId: user.id },
          select: { amount: true },
        }),
      ]);

      const amountOwed = assignment ? Number(assignment.amountOwed) : 0;
      const amountPaid = allPayments.reduce((s, p) => s + Number(p.amount), 0);
      const amountRemaining = Math.max(0, amountOwed - amountPaid);

      const result = await this.mail.sendPaymentReceivedEmail(user.email!, {
        recipientName: `${user.name} ${user.lastName}`.trim(),
        conceptName: concept.name,
        teamName: concept.team?.name,
        clubName: concept.club?.name,
        amount: amountOwed,
        amountPaid,
        amountRemaining,
        paidAt: payment.paidAt,
        method: payment.method,
        notes: payment.notes,
        receiptUrl: payment.receiptUrl,
        season: concept.season,
      });

      if (result.sent) {
        this.logger.log(
          `✉️ Email de pago recibido enviado a ${user.email} (payment ${paymentId})`,
        );
      } else {
        this.logger.warn(
          `⚠️ Email de pago recibido NO enviado a ${user.email}: ${result.reason}`,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `Error enviando email de pago recibido (payment ${paymentId}): ${err?.message ?? err}`,
      );
    }
  }

  // ─────────────────────────────────────────────
  // RESUMEN
  // ─────────────────────────────────────────────

  async getSummary(userId: string, filters: SummaryQueryDto) {
    if (!filters.clubId && !filters.teamId) {
      throw new BadRequestException('Debes indicar clubId o teamId');
    }

    const allowed = await canViewPaymentsSummary(this.prisma, userId, {
      clubId: filters.clubId ?? null,
      teamId: filters.teamId ?? null,
    });
    if (!allowed) {
      throw new ForbiddenException('No tienes acceso a estos pagos');
    }

       const conceptWhere: any = {};
    if (filters.season) conceptWhere.season = filters.season;
    if (filters.clubId) conceptWhere.clubId = filters.clubId;
    if (filters.teamId) conceptWhere.teamId = filters.teamId;

    const concepts = await this.prisma.paymentConcept.findMany({
      where: conceptWhere,
      include: {
        _count: { select: { assignments: true } },
        team: { select: { id: true, name: true } },
      },
    });

    const now = new Date();

    let totalOwed = 0;
    let totalPaid = 0;
    let paidCount = 0;
    let partialCount = 0;
    let pendingCount = 0;
    let overdueCount = 0;

    const byConcept: any[] = [];
    const byTeamMap = new Map<
      string,
      {
        teamId: string | null;
        teamName: string | null;
        totalOwed: number;
        totalPaid: number;
        conceptsCount: number;
      }
    >();

    for (const c of concepts) {
      const payments = await this.prisma.payment.findMany({
        where: { conceptId: c.id },
        select: { userId: true, amount: true },
      });

      const paidByUser = new Map<string, number>();
      for (const p of payments) {
        paidByUser.set(
          p.userId,
          (paidByUser.get(p.userId) ?? 0) + Number(p.amount),
        );
      }

      const assignments = await this.prisma.paymentAssignment.findMany({
        where: { conceptId: c.id },
        select: { userId: true, amountOwed: true },
      });

      let cOwed = 0;
      let cPaid = 0;
      let cPaidCount = 0;
      let cPartialCount = 0;
      let cPendingCount = 0;
      let cOverdueCount = 0;

      for (const a of assignments) {
        const paid = paidByUser.get(a.userId) ?? 0;
        const owed = Number(a.amountOwed);
        cOwed += owed;
        cPaid += paid;

        const status = this.computeStatus(paid, owed, c.dueDate, now);
        if (status === 'PAID') cPaidCount++;
        else if (status === 'PARTIAL') cPartialCount++;
        else if (status === 'OVERDUE') cOverdueCount++;
        else cPendingCount++;
      }

      totalOwed += cOwed;
      totalPaid += cPaid;
      paidCount += cPaidCount;
      partialCount += cPartialCount;
      pendingCount += cPendingCount;
      overdueCount += cOverdueCount;

      byConcept.push({
        id: c.id,
        name: c.name,
        teamId: c.teamId,
        teamName: c.team?.name ?? null,
        dueDate: c.dueDate,
        season: c.season,
        totalOwed: cOwed,
        totalPaid: cPaid,
        totalRemaining: Math.max(0, cOwed - cPaid),
        paidCount: cPaidCount,
        partialCount: cPartialCount,
        pendingCount: cPendingCount,
        overdueCount: cOverdueCount,
      });

      const teamKey = c.teamId ?? '__club__';
      const teamName = c.team?.name ?? null;
      const current = byTeamMap.get(teamKey) ?? {
        teamId: c.teamId,
        teamName,
        totalOwed: 0,
        totalPaid: 0,
        conceptsCount: 0,
      };
      current.totalOwed += cOwed;
      current.totalPaid += cPaid;
      current.conceptsCount += 1;
      byTeamMap.set(teamKey, current);
    }

    const byTeam = Array.from(byTeamMap.values()).map((t) => ({
      ...t,
      totalRemaining: Math.max(0, t.totalOwed - t.totalPaid),
    }));

    return {
      filters: {
        season: filters.season ?? null,
        clubId: filters.clubId ?? null,
        teamId: filters.teamId ?? null,
      },
      totals: {
        conceptsCount: concepts.length,
        totalOwed,
        totalPaid,
        totalRemaining: Math.max(0, totalOwed - totalPaid),
        paidCount,
        partialCount,
        pendingCount,
        overdueCount,
      },
      byTeam,
      byConcept,
    };
  }

  // ─────────────────────────────────────────────
  // UPLOAD DE JUSTIFICANTE
  // ─────────────────────────────────────────────

  async uploadReceipt(base64File: string) {
    if (!base64File || typeof base64File !== 'string') {
      throw new BadRequestException('Falta el archivo (base64)');
    }

    const result = await this.cloudinary.uploadFile(
      base64File,
      'training-pro/payments/receipts',
      'auto',
    );

    return {
      url: result.url,
      publicId: result.publicId,
      format: result.format,
      bytes: result.bytes,
    };
  }

  // ─────────────────────────────────────────────
  // MIS PAGOS (jugador)
  // ─────────────────────────────────────────────

  async getMyPayments(userId: string, filters: { season?: string }) {
    const where: any = { userId };
    if (filters.season) {
      where.concept = { season: filters.season };
    }

    const assignments = await this.prisma.paymentAssignment.findMany({
      where,
      include: {
        concept: {
          include: {
            team: { select: { id: true, name: true } },
            club: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ concept: { dueDate: 'desc' } }, { createdAt: 'desc' }],
    });

    const payments = await this.prisma.payment.findMany({
      where: { userId },
      select: {
        id: true,
        conceptId: true,
        amount: true,
        paidAt: true,
        method: true,
        notes: true,
        receiptUrl: true,
        createdAt: true,
      },
      orderBy: { paidAt: 'desc' },
    });

    const paymentsByConcept = new Map<string, typeof payments>();
    for (const p of payments) {
      const arr = paymentsByConcept.get(p.conceptId) ?? [];
      arr.push(p);
      paymentsByConcept.set(p.conceptId, arr);
    }

    const now = new Date();

    const items = assignments.map((a) => {
      const conceptPayments = paymentsByConcept.get(a.conceptId) ?? [];
      const paid = conceptPayments.reduce((s, p) => s + Number(p.amount), 0);
      const owed = Number(a.amountOwed);
      const status = this.computeStatus(paid, owed, a.concept.dueDate, now);

      return {
        conceptId: a.concept.id,
        name: a.concept.name,
        description: a.concept.description,
        season: a.concept.season,
        dueDate: a.concept.dueDate,
        amountOwed: owed,
        amountPaid: paid,
        amountRemaining: Math.max(0, owed - paid),
        status,
        team: a.concept.team,
        club: a.concept.club,
        payments: conceptPayments.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          paidAt: p.paidAt,
          method: p.method,
          notes: p.notes,
          receiptUrl: p.receiptUrl,
          createdAt: p.createdAt,
        })),
      };
    });

    const totalOwed = items.reduce((s, i) => s + i.amountOwed, 0);
    const totalPaid = items.reduce((s, i) => s + i.amountPaid, 0);

    return {
      totals: {
        conceptsCount: items.length,
        totalOwed,
        totalPaid,
        totalRemaining: Math.max(0, totalOwed - totalPaid),
        paidCount: items.filter((i) => i.status === 'PAID').length,
        partialCount: items.filter((i) => i.status === 'PARTIAL').length,
        pendingCount: items.filter((i) => i.status === 'PENDING').length,
        overdueCount: items.filter((i) => i.status === 'OVERDUE').length,
      },
      items,
    };
  }

  // ─────────────────────────────────────────────
  // ASIGNACIÓN POST-CREACIÓN
  // ─────────────────────────────────────────────

  async assignPlayers(
    userId: string,
    conceptId: string,
    userIds: string[],
  ) {
    const concept = await this.prisma.paymentConcept.findUnique({
      where: { id: conceptId },
      select: {
        id: true,
        clubId: true,
        teamId: true,
        amount: true,
      },
    });
    if (!concept) throw new NotFoundException('Concepto no encontrado');

    await assertCanManagePaymentConcept(this.prisma, userId, {
      clubId: concept.clubId,
      teamId: concept.teamId,
    });

    if (userIds.length === 0) {
      throw new BadRequestException('Debes indicar al menos un jugador');
    }

    if (concept.teamId) {
      const validMemberships = await this.prisma.teamMembership.findMany({
        where: {
          teamId: concept.teamId,
          userId: { in: userIds },
          status: 'ACTIVE',
        },
        select: { userId: true },
      });
      const validIds = new Set(validMemberships.map((m) => m.userId));
      const invalid = userIds.filter((id) => !validIds.has(id));
      if (invalid.length > 0) {
        throw new BadRequestException(
          `Algunos usuarios no pertenecen al equipo: ${invalid.join(', ')}`,
        );
      }
    }

    const created = await this.prisma.paymentAssignment.createMany({
      data: userIds.map((uid) => ({
        conceptId,
        userId: uid,
        amountOwed: concept.amount,
      })),
      skipDuplicates: true,
    });

    return {
      ...(await this.getConceptDetail(userId, conceptId)),
      assignedCount: created.count,
    };
  }

  async unassignPlayer(
    userId: string,
    conceptId: string,
    targetUserId: string,
  ) {
    const concept = await this.prisma.paymentConcept.findUnique({
      where: { id: conceptId },
      select: { id: true, clubId: true, teamId: true },
    });
    if (!concept) throw new NotFoundException('Concepto no encontrado');

    await assertCanManagePaymentConcept(this.prisma, userId, {
      clubId: concept.clubId,
      teamId: concept.teamId,
    });

    const assignment = await this.prisma.paymentAssignment.findUnique({
      where: {
        conceptId_userId: { conceptId, userId: targetUserId },
      },
    });
    if (!assignment) {
      throw new NotFoundException('El jugador no está asignado a este concepto');
    }

    const paymentsCount = await this.prisma.payment.count({
      where: { conceptId, userId: targetUserId },
    });

    if (paymentsCount > 0) {
      throw new BadRequestException(
        'No se puede desasignar a un jugador que ya tiene pagos registrados en este concepto. Elimina primero sus pagos.',
      );
    }

    await this.prisma.paymentAssignment.delete({
      where: {
        conceptId_userId: { conceptId, userId: targetUserId },
      },
    });

    return this.getConceptDetail(userId, conceptId);
  }

   async syncTeamAssignments(userId: string, conceptId: string) {
    const concept = await this.prisma.paymentConcept.findUnique({
      where: { id: conceptId },
      select: {
        id: true,
        clubId: true,
        teamId: true,
        amount: true,
      },
    });
    if (!concept) throw new NotFoundException('Concepto no encontrado');
    if (!concept.teamId) {
      throw new BadRequestException(
        'Este concepto no está asociado a ningún equipo',
      );
    }

    await assertCanManagePaymentConcept(this.prisma, userId, {
      clubId: concept.clubId,
      teamId: concept.teamId,
    });
        const memberships = await this.prisma.teamMembership.findMany({
      where: {
        teamId: concept.teamId,
        status: 'ACTIVE',
        roles: { some: { role: 'PLAYER' } },
      },
      select: { userId: true },
    });

    const existing = await this.prisma.paymentAssignment.findMany({
      where: { conceptId },
      select: { userId: true },
    });
    const existingIds = new Set(existing.map((a) => a.userId));

    const toAdd = memberships
      .map((m) => m.userId)
      .filter((id) => !existingIds.has(id));

    if (toAdd.length === 0) {
      return {
        ...(await this.getConceptDetail(userId, conceptId)),
        assignedCount: 0,
      };
    }

    const created = await this.prisma.paymentAssignment.createMany({
      data: toAdd.map((uid) => ({
        conceptId,
        userId: uid,
        amountOwed: concept.amount,
      })),
      skipDuplicates: true,
    });

    return {
      ...(await this.getConceptDetail(userId, conceptId)),
      assignedCount: created.count,
    };
  }

  // ─────────────────────────────────────────────
  // RECORDATORIOS DE PAGO
  // ─────────────────────────────────────────────

  /**
   * Ejecuta los recordatorios de pago pendientes.
   */
  async runReminders(userId: string, filters: RunRemindersDto) {
    const isSuper = await isSuperAdmin(this.prisma, userId);
    if (!isSuper) {
      throw new ForbiddenException(
        'Solo los super administradores pueden ejecutar recordatorios',
      );
    }

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    );

    const conceptWhere: any = {
      emailRemindersEnabled: true,
    };
    if (filters.season) conceptWhere.season = filters.season;
    if (filters.clubId) conceptWhere.clubId = filters.clubId;
    if (filters.teamId) conceptWhere.teamId = filters.teamId;

    const concepts = await this.prisma.paymentConcept.findMany({
      where: conceptWhere,
      include: {
        team: { select: { id: true, name: true } },
        club: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const candidates = concepts.filter((c) => {
      const daysUntilDue = this.daysBetween(startOfToday, c.dueDate);
      if (daysUntilDue < 0) return true;
      if (daysUntilDue <= c.reminderDaysBefore) return true;
      return false;
    });

    const details: Array<{
      conceptId: string;
      conceptName: string;
      dueDate: Date;
      daysUntilDue: number;
      reminderType: 'BEFORE_DUE' | 'AFTER_DUE';
      sent: number;
      skipped: number;
      sentTo: Array<{
        userId: string;
        email: string;
        status: 'sent' | 'failed' | 'skipped';
        reason?: string;
      }>;
    }> = [];

    let totalSent = 0;
    let totalSkipped = 0;

    for (const concept of candidates) {
      const daysUntilDue = this.daysBetween(startOfToday, concept.dueDate);
      const reminderType: 'BEFORE_DUE' | 'AFTER_DUE' =
        daysUntilDue < 0 ? 'AFTER_DUE' : 'BEFORE_DUE';

      const assignments = await this.prisma.paymentAssignment.findMany({
        where: { conceptId: concept.id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              lastName: true,
              email: true,
              emailNotificationsEnabled: true,
              emailOptOut: true,
            },
          },
        },
      });

      const payments = await this.prisma.payment.findMany({
        where: { conceptId: concept.id },
        select: { userId: true, amount: true },
      });
      const paidByUser = new Map<string, number>();
      for (const p of payments) {
        paidByUser.set(
          p.userId,
          (paidByUser.get(p.userId) ?? 0) + Number(p.amount),
        );
      }

      const existingReminders = await this.prisma.paymentReminder.findMany({
        where: { conceptId: concept.id, type: reminderType },
        select: { userId: true },
      });
      const alreadyReminded = new Set(existingReminders.map((r) => r.userId));

      const sentTo: Array<{
        userId: string;
        email: string;
        status: 'sent' | 'failed' | 'skipped';
        reason?: string;
      }> = [];
      let conceptSent = 0;
      let conceptSkipped = 0;

      for (const a of assignments) {
        const { user } = a;
        const owed = Number(a.amountOwed);
        const paid = paidByUser.get(user.id) ?? 0;
        const remaining = Math.max(0, owed - paid);

        if (remaining <= 0 || paid >= owed) {
          conceptSkipped++;
          continue;
        }

        if (alreadyReminded.has(user.id)) {
          conceptSkipped++;
          continue;
        }

        if (!user.emailNotificationsEnabled || user.emailOptOut) {
          sentTo.push({
            userId: user.id,
            email: user.email ?? '',
            status: 'skipped',
            reason: 'prefs del usuario',
          });
          conceptSkipped++;
          continue;
        }

        if (!this.mail.isRealEmail(user.email)) {
          sentTo.push({
            userId: user.id,
            email: user.email ?? '',
            status: 'skipped',
            reason: 'email no válido (ghost)',
          });
          conceptSkipped++;
          continue;
        }

        if (filters.dryRun) {
          sentTo.push({
            userId: user.id,
            email: user.email!,
            status: 'skipped',
            reason: 'dry run',
          });
          conceptSkipped++;
          continue;
        }

        try {
          const result = await this.mail.sendPaymentReminderEmail(user.email!, {
            recipientName: `${user.name} ${user.lastName}`.trim(),
            conceptName: concept.name,
            teamName: concept.team?.name,
            clubName: concept.club?.name,
            amountOwed: owed,
            amountPaid: paid,
            amountRemaining: remaining,
            dueDate: concept.dueDate,
            daysUntilDue,
            season: concept.season,
          });

          if (result.sent) {
            await this.prisma.paymentReminder.create({
              data: {
                conceptId: concept.id,
                userId: user.id,
                type: reminderType,
              },
            });
            sentTo.push({
              userId: user.id,
              email: user.email!,
              status: 'sent',
            });
            conceptSent++;
          } else {
            sentTo.push({
              userId: user.id,
              email: user.email!,
              status: 'failed',
              reason: result.reason,
            });
          }
        } catch (err: any) {
          sentTo.push({
            userId: user.id,
            email: user.email!,
            status: 'failed',
            reason: err?.message ?? 'unknown error',
          });
        }
      }

      details.push({
        conceptId: concept.id,
        conceptName: concept.name,
        dueDate: concept.dueDate,
        daysUntilDue,
        reminderType,
        sent: conceptSent,
        skipped: conceptSkipped,
        sentTo,
      });

      totalSent += conceptSent;
      totalSkipped += conceptSkipped;
    }

    return {
      runAt: now.toISOString(),
      dryRun: !!filters.dryRun,
      filters: {
        season: filters.season ?? null,
        clubId: filters.clubId ?? null,
        teamId: filters.teamId ?? null,
      },
      conceptsProcessed: candidates.length,
      remindersSent: totalSent,
      remindersSkipped: totalSkipped,
      details,
    };
  }

  /**
   * Devuelve la diferencia en días (enteros) entre dos fechas.
   */
  private daysBetween(from: Date, to: Date): number {
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const fromStart = new Date(
      from.getFullYear(),
      from.getMonth(),
      from.getDate(),
    ).getTime();
    const toStart = new Date(
      to.getFullYear(),
      to.getMonth(),
      to.getDate(),
    ).getTime();
    return Math.round((toStart - fromStart) / MS_PER_DAY);
  }


    // ─────────────────────────────────────────────
  // RECIBO PDF
  // ─────────────────────────────────────────────

  /**
   * Genera el PDF del recibo de un pago concreto.
   * Verifica permisos: el usuario debe poder ver el concepto del pago.
   */
  async generateReceipt(
    paymentId: string,
    viewerId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        concept: {
          include: {
            club: {
              select: {
                id: true,
                name: true,
                logo: true,
                address: true,
                phone: true,
                email: true,
              },
            },
            team: { select: { id: true, name: true } },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!payment) throw new NotFoundException('Pago no encontrado');

    await assertCanViewPaymentConcept(this.prisma, viewerId, {
      clubId: payment.concept.clubId,
      teamId: payment.concept.teamId,
    });

    // Estado del jugador en este concepto
    const [assignment, allPayments] = await Promise.all([
      this.prisma.paymentAssignment.findUnique({
        where: {
          conceptId_userId: {
            conceptId: payment.conceptId,
            userId: payment.userId,
          },
        },
      }),
      this.prisma.payment.findMany({
        where: { conceptId: payment.conceptId, userId: payment.userId },
        select: { amount: true },
      }),
    ]);

    const conceptAmountPerPlayer = assignment
      ? Number(assignment.amountOwed)
      : Number(payment.concept.amount);
    const totalPaidByPlayer = allPayments.reduce(
      (s, p) => s + Number(p.amount),
      0,
    );
    const totalRemaining = Math.max(
      0,
      conceptAmountPerPlayer - totalPaidByPlayer,
    );

    const data: PaymentReceiptData = {
      clubName: payment.concept.club.name,
      clubLogoUrl: payment.concept.club.logo,
      clubAddress: payment.concept.club.address,
      clubPhone: payment.concept.club.phone,
      clubEmail: payment.concept.club.email,

      conceptName: payment.concept.name,
      conceptDescription: payment.concept.description,
      conceptSeason: payment.concept.season,
      conceptDueDate: payment.concept.dueDate,
      conceptAmountPerPlayer,

      teamName: payment.concept.team?.name ?? null,

      playerName: `${payment.user.name} ${payment.user.lastName}`.trim(),
      playerEmail: payment.user.email,

      paymentId: payment.id,
      paymentAmount: Number(payment.amount),
      paymentPaidAt: payment.paidAt,
      paymentMethod: payment.method,
      paymentNotes: payment.notes,

      totalPaidByPlayer,
      totalRemaining,

      issuedAt: new Date(),
    };

    const buffer = await generateReceiptPdf(data);

    const conceptSlug = this.slugify(payment.concept.name);
    const playerSlug = this.slugify(
      `${payment.user.name} ${payment.user.lastName}`,
    );
    const dateSlug = payment.paidAt.toISOString().slice(0, 10);
    const filename = `recibo-${conceptSlug}-${playerSlug}-${dateSlug}.pdf`;

    return { buffer, filename };
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
  }


  

    // ─────────────────────────────────────────────
  // EDITAR IMPORTE DE UNA ASIGNACIÓN
  // ─────────────────────────────────────────────

  async updateAssignment(
    userId: string,
    conceptId: string,
    targetUserId: string,
    newAmountOwed: number,
  ) {
    const concept = await this.prisma.paymentConcept.findUnique({
      where: { id: conceptId },
      select: { id: true, clubId: true, teamId: true },
    });
    if (!concept) throw new NotFoundException('Concepto no encontrado');

    await assertCanManagePaymentConcept(this.prisma, userId, {
      clubId: concept.clubId,
      teamId: concept.teamId,
    });

    const assignment = await this.prisma.paymentAssignment.findUnique({
      where: {
        conceptId_userId: { conceptId, userId: targetUserId },
      },
    });
    if (!assignment) {
      throw new NotFoundException('El jugador no está asignado a este concepto');
    }

    const paymentsCount = await this.prisma.payment.count({
      where: { conceptId, userId: targetUserId },
    });
    if (paymentsCount > 0) {
      throw new BadRequestException(
        'No se puede modificar el importe de un jugador que ya tiene pagos registrados. Elimina primero sus pagos.',
      );
    }

    if (!Number.isFinite(newAmountOwed) || newAmountOwed < 0) {
      throw new BadRequestException('Importe no válido');
    }

    await this.prisma.paymentAssignment.update({
      where: {
        conceptId_userId: { conceptId, userId: targetUserId },
      },
      data: { amountOwed: newAmountOwed },
    });

    return this.getConceptDetail(userId, conceptId);
  }
}

   