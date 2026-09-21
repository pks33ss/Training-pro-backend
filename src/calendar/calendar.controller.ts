import { Controller, Get, Post, Put, Delete, Body, Param, Query, Request, UseGuards } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { CalendarService } from './calendar.service'
import { AuthGuard } from '../auth/auth.guard'

@ApiTags('calendar')
@ApiBearerAuth('access-token')
@Controller('calendar')
@UseGuards(AuthGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('team/:teamId')
  @ApiOperation({ summary: 'Obtener eventos de un equipo en un rango de fechas' })
  getEvents(
    @Request() req,
    @Param('teamId') teamId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const toDate = to ? new Date(to) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59)
    return this.calendarService.getEvents(req.user.id, teamId, fromDate, toDate)
  }

    @Post('by-teams')
  @ApiOperation({ summary: 'Obtener eventos de varios equipos en un rango de fechas' })
  getEventsByTeams(
    @Request() req,
    @Body() body: { teamIds: string[]; from: string; to: string },
  ) {
    const fromDate = body.from
      ? new Date(body.from)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const toDate = body.to
      ? new Date(body.to)
      : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59)
    return this.calendarService.getEventsByTeams(req.user.id, body.teamIds, fromDate, toDate)
  }

  @Post('team/:teamId/events')
  @ApiOperation({ summary: 'Crear evento de calendario' })
  createEvent(
    @Request() req,
    @Param('teamId') teamId: string,
    @Body() body: any,
  ) {
    return this.calendarService.createEvent(req.user.id, teamId, body)
  }

  @Put('events/:eventId')
  @ApiOperation({ summary: 'Actualizar evento' })
  updateEvent(
    @Request() req,
    @Param('eventId') eventId: string,
    @Body() body: any,
  ) {
    return this.calendarService.updateEvent(req.user.id, eventId, body)
  }

  @Delete('events/:eventId')
  @ApiOperation({ summary: 'Eliminar evento' })
  removeEvent(@Request() req, @Param('eventId') eventId: string) {
    return this.calendarService.removeEvent(req.user.id, eventId)
  }
}