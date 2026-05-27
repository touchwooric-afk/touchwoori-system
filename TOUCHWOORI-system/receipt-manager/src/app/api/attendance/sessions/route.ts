export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { formatAttendanceWeekLabel, nextSundayInKorea } from '@/lib/attendance';
import { getAttendanceAccess } from '@/lib/attendance-server';

async function loadSessionRecords(serviceClient: ReturnType<typeof import('@/lib/supabase-server').createServiceClient>, sessionId: string) {
  const { data, error } = await serviceClient
    .from('attendance_records')
    .select('*, member:attendance_members(*)')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const access = await getAttendanceAccess('check', searchParams.get('department_id'));
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { data, error } = await access.serviceClient
    .from('attendance_sessions')
    .select('*')
    .eq('department_id', access.departmentId)
    .order('attendance_date', { ascending: false })
    .limit(20);
  if (error) {
    return NextResponse.json({ error: `기록 조회에 실패했습니다: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ data: data || [] });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const access = await getAttendanceAccess('check', body.department_id as string | undefined);
    if ('error' in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const attendanceDate = typeof body.attendance_date === 'string'
      ? body.attendance_date
      : nextSundayInKorea();
    const title = typeof body.title === 'string' && body.title.trim()
      ? body.title.trim()
      : '주일예배';

    let { data: session } = await access.serviceClient
      .from('attendance_sessions')
      .select('*')
      .eq('department_id', access.departmentId)
      .eq('attendance_date', attendanceDate)
      .eq('title', title)
      .maybeSingle();

    if (!session) {
      const result = await access.serviceClient
        .from('attendance_sessions')
        .insert({
          department_id: access.departmentId,
          attendance_date: attendanceDate,
          week_label: formatAttendanceWeekLabel(attendanceDate),
          title,
          created_by: access.authUser.id,
        })
        .select()
        .single();
      if (result.error) throw new Error(result.error.message);
      session = result.data;
    }

    const { data: members, error: membersError } = await access.serviceClient
      .from('attendance_members')
      .select('id')
      .eq('department_id', access.departmentId)
      .eq('is_active', true)
      .lte('active_from', attendanceDate)
      .or(`active_until.is.null,active_until.gte.${attendanceDate}`);
    if (membersError) throw new Error(membersError.message);

    if (members && members.length > 0) {
      const { error: recordError } = await access.serviceClient
        .from('attendance_records')
        .upsert(
          members.map((member) => ({
            session_id: session.id,
            member_id: member.id,
            status: 'present',
            checked_by: access.authUser.id,
          })),
          { onConflict: 'session_id,member_id', ignoreDuplicates: true }
        );
      if (recordError) throw new Error(recordError.message);
    }

    const records = await loadSessionRecords(access.serviceClient, session.id);
    return NextResponse.json({ data: { session, records } });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `출석 회차 생성에 실패했습니다: ${detail}` }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const access = await getAttendanceAccess('check', body.department_id as string | undefined);
    if ('error' in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    const status = body.status;
    if (typeof body.record_id !== 'string' || !['present', 'absent', 'late'].includes(String(status))) {
      return NextResponse.json({ error: '출석 기록과 상태를 확인해주세요' }, { status: 400 });
    }

    const { data: record } = await access.serviceClient
      .from('attendance_records')
      .select('id, attendance_sessions!inner(department_id)')
      .eq('id', body.record_id)
      .eq('attendance_sessions.department_id', access.departmentId)
      .single();
    if (!record) {
      return NextResponse.json({ error: '출석 기록을 찾을 수 없습니다' }, { status: 404 });
    }

    const { data, error } = await access.serviceClient
      .from('attendance_records')
      .update({ status, checked_by: access.authUser.id })
      .eq('id', body.record_id)
      .select('*, member:attendance_members(*)')
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ data });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `출석 상태 수정에 실패했습니다: ${detail}` }, { status: 500 });
  }
}
