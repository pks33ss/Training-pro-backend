import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getDashboardData() {
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    // 1. Totales
    const [
      demoOpens,
      totalUsers,
      totalClubs,
      totalTeams,
      totalSessions,
      totalExercises,
      totalPlays,
    ] = await Promise.all([
      this.prisma.appMetricEvent.count({ where: { type: 'DEMO_OPEN' } }),
      this.prisma.user.count({ where: { email: { not: null } } }),
      this.prisma.club.count(),
      this.prisma.team.count(),
      this.prisma.session.count(),
      this.prisma.exercise.count(),
      this.prisma.play.count(),
    ]);

    // 2. Serie temporal de los últimos 30 días
    const dateList: string[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      d.setHours(0, 0, 0, 0);
      dateList.push(d.toISOString().split('T')[0]);
    }

    // Función auxiliar para agrupar por día
    const groupByDay = (items: { createdAt: Date }[]) => {
      const counts = new Map<string, number>();
      dateList.forEach(d => counts.set(d, 0));
      
      items.forEach(item => {
        const day = item.createdAt.toISOString().split('T')[0];
        if (counts.has(day)) {
          counts.set(day, (counts.get(day) || 0) + 1);
        }
      });

      return dateList.map(date => ({
        date,
        value: counts.get(date) || 0,
      }));
    };

    // Traemos los datos creados en los últimos 30 días para cada entidad
    const usersLast30 = await this.prisma.user.findMany({
  where: { 
    createdAt: { gte: thirtyDaysAgo },
    email: { not: null }
  },
  select: { createdAt: true },
});

    const clubsLast30 = await this.prisma.club.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    });

    const teamsLast30 = await this.prisma.team.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    });

    const sessionsLast30 = await this.prisma.session.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    });

    const exercisesLast30 = await this.prisma.exercise.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    });

    const playsLast30 = await this.prisma.play.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    });

    const demoLast30 = await this.prisma.appMetricEvent.findMany({
      where: { 
        type: 'DEMO_OPEN',
        createdAt: { gte: thirtyDaysAgo } 
      },
      select: { createdAt: true },
    });

    return {
      totals: {
        demoOpens,
        users: totalUsers,
        clubs: totalClubs,
        teams: totalTeams,
        sessions: totalSessions,
        exercises: totalExercises,
        plays: totalPlays,
      },
      trends: {
        demoOpens: groupByDay(demoLast30),
        users: groupByDay(usersLast30),
        clubs: groupByDay(clubsLast30),
        teams: groupByDay(teamsLast30),
        sessions: groupByDay(sessionsLast30),
        exercises: groupByDay(exercisesLast30),
        plays: groupByDay(playsLast30),
      }
    };
  }
}