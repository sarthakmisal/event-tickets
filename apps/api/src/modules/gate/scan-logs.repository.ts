import type { Insertable } from 'kysely';
import type { Executor, ScanLogsTable } from '../../db/schema';

export interface ScanLogRow {
  id: string;
  code: string;
  mode: 'ENTRY' | 'EXIT';
  ok: boolean;
  reason: string | null;
  attendee_name: string | null;
  scanned_by_name: string;
  created_at: Date;
}

export const scanLogsRepository = (db: Executor) => ({
  async insert(values: Insertable<ScanLogsTable>): Promise<void> {
    await db.insertInto('scan_logs').values(values).execute();
  },

  recentForEvent(eventId: string, limit: number): Promise<ScanLogRow[]> {
    return db
      .selectFrom('scan_logs as s')
      .innerJoin('users as u', 'u.id', 's.scanned_by')
      .leftJoin('tickets as t', 't.id', 's.ticket_id')
      .select([
        's.id',
        's.code',
        's.mode',
        's.ok',
        's.reason',
        's.created_at',
        't.attendee_name as attendee_name',
        'u.name as scanned_by_name',
      ])
      .where('s.event_id', '=', eventId)
      .orderBy('s.created_at', 'desc')
      .limit(limit)
      .execute();
  },
});
