// backend/src/live-events/live-stats-sse.service.ts

import { Injectable } from '@nestjs/common'
import { Subject, Observable } from 'rxjs'

@Injectable()
export class LiveStatsSseService {
  // Un Subject por cada sesión de estadísticas
  private sessions = new Map<string, Subject<any>>()

  getStream(sessionId: string): Observable<any> {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, new Subject<any>())
    }
    return this.sessions.get(sessionId)!.asObservable()
  }

  emit(sessionId: string, data: any) {
    const subject = this.sessions.get(sessionId)
    if (subject) {
      subject.next(data)
    }
  }
}