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

  return {
    member_type: memberType,
    name,
    grade,
    position: memberType === 'teacher' && typeof body.position === 'string'
      ? body.position.trim() || null
      : null,
    is_homeroom: memberType === 'teacher' ? Boolean(body.is_homeroom) : false,
    student_kind: studentKind,
    active_from: typeof body.active_from === 'string' ? body.active_from : undefined,
    active_until: typeof body.active_until === 'string' && body.active_until
      ? body.active_until
      : null,
    is_active: body.is_active === undefined ? true : Boolean(body.is_active),
    memo: typeof body.memo === 'string' ? body.memo.trim() || null : null,
  };
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
    .select('*')
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
      .select()
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
    const { data, error } = await access.serviceClient
      .from('attendance_members')
      .update(input)
      .eq('id', body.id)
      .eq('department_id', access.departmentId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: `명단 수정에 실패했습니다: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ data });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: detail }, { status: 400 });
  }
}
