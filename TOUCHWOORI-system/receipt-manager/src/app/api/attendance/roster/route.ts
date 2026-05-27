export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getAttendanceAccess } from '@/lib/attendance-server';
import type { AttendanceMemberType, AttendanceStudentKind } from '@/types';

function cleanMemberInput(body: Record<string, unknown>) {
  const memberType = body.member_type as AttendanceMemberType;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const grade = memberType === 'student' ? Number(body.grade) : null;
  const studentKind = memberType === 'student'
    ? (body.student_kind as AttendanceStudentKind || 'enrolled')
    : null;

  if (!['student', 'teacher'].includes(memberType) || !name) {
    throw new Error('이름과 구분을 입력해주세요');
  }
  if (memberType === 'student' && (grade === null || ![1, 2, 3].includes(grade))) {
    throw new Error('학생 학년을 선택해주세요');
  }
  if (studentKind && !['enrolled', 'newcomer'].includes(studentKind)) {
    throw new Error('등록 유형이 올바르지 않습니다');
  }

  const input: Record<string, string | number | boolean | null> = {
    member_type: memberType,
    name,
    grade,
    position: memberType === 'teacher' && typeof body.position === 'string'
      ? body.position.trim() || null
      : null,
    is_homeroom: memberType === 'teacher' ? Boolean(body.is_homeroom) : false,
    student_kind: studentKind,
    is_long_absent: memberType === 'student' ? Boolean(body.is_long_absent) : false,
    homeroom_teacher_id: memberType === 'student' && typeof body.homeroom_teacher_id === 'string' && body.homeroom_teacher_id
      ? body.homeroom_teacher_id
      : null,
    is_active: body.is_active === undefined ? true : Boolean(body.is_active),
    memo: typeof body.memo === 'string' ? body.memo.trim() || null : null,
  };

  if (typeof body.active_from === 'string' && body.active_from) {
    input.active_from = body.active_from;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'active_until')) {
    input.active_until = typeof body.active_until === 'string' && body.active_until
      ? body.active_until
      : null;
  }
  return input;
}

async function validateHomeroomTeacher(
  serviceClient: ReturnType<typeof import('@/lib/supabase-server').createServiceClient>,
  departmentId: string,
  input: Record<string, string | number | boolean | null>
) {
  if (input.member_type !== 'student' || typeof input.homeroom_teacher_id !== 'string') return;
  const { data } = await serviceClient
    .from('attendance_members')
    .select('id')
    .eq('id', input.homeroom_teacher_id)
    .eq('department_id', departmentId)
    .eq('member_type', 'teacher')
    .eq('is_active', true)
    .maybeSingle();
  if (!data) throw new Error('선택한 담임선생님을 찾을 수 없습니다');
}

async function syncLongAbsentRecords(
  serviceClient: ReturnType<typeof import('@/lib/supabase-server').createServiceClient>,
  departmentId: string,
  memberId: string,
  isLongAbsent: boolean
) {
  const todayInKorea = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  let query = serviceClient
    .from('attendance_sessions')
    .select('id')
    .eq('department_id', departmentId);
  query = isLongAbsent
    ? query.gte('attendance_date', todayInKorea)
    : query.gt('attendance_date', todayInKorea);
  const { data: sessions, error: sessionError } = await query;
  if (sessionError) throw new Error(sessionError.message);
  if (!sessions?.length) return;

  const { error } = await serviceClient
    .from('attendance_records')
    .update({ status: isLongAbsent ? 'absent' : 'present' })
    .eq('member_id', memberId)
    .in('session_id', sessions.map((session) => session.id));
  if (error) throw new Error(error.message);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const access = await getAttendanceAccess('check', searchParams.get('department_id'));
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const includeInactive = searchParams.get('include_inactive') === 'true';
  let query = access.serviceClient
    .from('attendance_members')
    .select('*, homeroom_teacher:attendance_members!attendance_members_homeroom_teacher_id_fkey(id, name)')
    .eq('department_id', access.departmentId)
    .order('member_type', { ascending: true })
    .order('grade', { ascending: true })
    .order('name', { ascending: true });

  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: `명단 조회에 실패했습니다: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ data: data || [] });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const isNewcomerAtSession = body.member_type === 'student'
      && body.student_kind === 'newcomer'
      && typeof body.session_id === 'string';
    const access = await getAttendanceAccess(isNewcomerAtSession ? 'check' : 'manage', body.department_id as string | undefined);
    if ('error' in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const input = cleanMemberInput(body);
    await validateHomeroomTeacher(access.serviceClient, access.departmentId, input);
    if (access.profile.role === 'teacher' && input.student_kind !== 'newcomer') {
      return NextResponse.json({ error: '새친구만 현장에서 추가할 수 있습니다' }, { status: 403 });
    }

    let sessionId: string | null = null;
    if (typeof body.session_id === 'string') {
      const { data: session } = await access.serviceClient
        .from('attendance_sessions')
        .select('id')
        .eq('id', body.session_id)
        .eq('department_id', access.departmentId)
        .single();
      if (!session && access.profile.role === 'teacher') {
        return NextResponse.json({ error: '열려 있는 출석 회차에서만 새친구를 추가할 수 있습니다' }, { status: 403 });
      }
      sessionId = session?.id || null;
    }

    const { data: member, error } = await access.serviceClient
      .from('attendance_members')
      .insert({ ...input, department_id: access.departmentId })
      .select('*, homeroom_teacher:attendance_members!attendance_members_homeroom_teacher_id_fkey(id, name)')
      .single();

    if (error) {
      return NextResponse.json({ error: `명단 등록에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    if (sessionId) {
      const { error: recordError } = await access.serviceClient.from('attendance_records').insert({
          session_id: sessionId,
          member_id: member.id,
          status: 'present',
          checked_by: access.authUser.id,
      });
      if (recordError) {
        return NextResponse.json({ error: `출석 등록에 실패했습니다: ${recordError.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ data: member }, { status: 201 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: detail }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const access = await getAttendanceAccess('manage', body.department_id as string | undefined);
    if ('error' in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    if (typeof body.id !== 'string') {
      return NextResponse.json({ error: '명단 ID가 필요합니다' }, { status: 400 });
    }

    const input = cleanMemberInput(body);
    await validateHomeroomTeacher(access.serviceClient, access.departmentId, input);
    const { data, error } = await access.serviceClient
      .from('attendance_members')
      .update(input)
      .eq('id', body.id)
      .eq('department_id', access.departmentId)
      .select('*, homeroom_teacher:attendance_members!attendance_members_homeroom_teacher_id_fkey(id, name)')
      .single();

    if (error) {
      return NextResponse.json({ error: `명단 수정에 실패했습니다: ${error.message}` }, { status: 500 });
    }
    if (input.member_type === 'student' && typeof input.is_long_absent === 'boolean') {
      await syncLongAbsentRecords(access.serviceClient, access.departmentId, body.id, input.is_long_absent);
    }
    return NextResponse.json({ data });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: detail }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const access = await getAttendanceAccess('manage', body.department_id as string | undefined);
    if ('error' in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    if (typeof body.id !== 'string') {
      return NextResponse.json({ error: '교사 ID가 필요합니다' }, { status: 400 });
    }

    const { data: teacher } = await access.serviceClient
      .from('attendance_members')
      .select('id')
      .eq('id', body.id)
      .eq('department_id', access.departmentId)
      .eq('member_type', 'teacher')
      .maybeSingle();
    if (!teacher) {
      return NextResponse.json({ error: '교사 정보를 찾을 수 없습니다' }, { status: 404 });
    }

    const { error: assignmentError } = await access.serviceClient
      .from('attendance_members')
      .update({ homeroom_teacher_id: null })
      .eq('department_id', access.departmentId)
      .eq('homeroom_teacher_id', body.id);
    if (assignmentError) throw new Error(assignmentError.message);

    const { error } = await access.serviceClient
      .from('attendance_members')
      .update({ is_active: false, is_homeroom: false })
      .eq('id', body.id)
      .eq('department_id', access.departmentId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ data: { id: body.id } });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `교사 삭제에 실패했습니다: ${detail}` }, { status: 500 });
  }
}
