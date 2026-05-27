export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getAttendanceAccess } from '@/lib/attendance-server';

function nextMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1));
  return next.toISOString().slice(0, 7);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || '';
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json({ error: '조회할 월을 선택해주세요' }, { status: 400 });
    }

    const access = await getAttendanceAccess('check', searchParams.get('department_id'));
    if ('error' in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { data: sessions, error: sessionsError } = await access.serviceClient
      .from('attendance_sessions')
      .select('*')
      .eq('department_id', access.departmentId)
      .gte('attendance_date', `${month}-01`)
      .lt('attendance_date', `${nextMonth(month)}-01`)
      .order('attendance_date', { ascending: true });
    if (sessionsError) throw new Error(sessionsError.message);
    if (!sessions?.length) {
      return NextResponse.json({ data: { month, sessions: [], records: [] } });
    }

    const { data: records, error: recordsError } = await access.serviceClient
      .from('attendance_records')
      .select('*, member:attendance_members(*)')
      .in('session_id', sessions.map((session) => session.id))
      .order('created_at', { ascending: true });
    if (recordsError) throw new Error(recordsError.message);

    return NextResponse.json({ data: { month, sessions, records: records || [] } });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `출석 통계 조회에 실패했습니다: ${detail}` }, { status: 500 });
  }
}
