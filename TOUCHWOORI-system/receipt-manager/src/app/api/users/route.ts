export const runtime = 'nodejs';

import { createServerClient, createServiceClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

// GET: 사용자 목록 조회 (master 전용)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (!profile || profile.status !== 'active') {
      return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 });
    }

    if (profile.role !== 'master' && profile.role !== 'sub_master') {
      return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('users')
      .select('*', { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: `사용자 목록 조회에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      pageSize,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}

// PATCH: 사용자 정보 수정 (master 전용 - 승인/비활성화)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (!profile || profile.status !== 'active') {
      return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 });
    }

    if (profile.role !== 'master' && profile.role !== 'sub_master') {
      return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 });
    }

    const body = await request.json();
    const { id, role, status, position, department_id } = body;

    if (!id) {
      return NextResponse.json({ error: '사용자 ID가 필요합니다' }, { status: 400 });
    }

    // sub_master는 master/sub_master 계정 수정 불가
    if (profile.role === 'sub_master') {
      const { data: targetUser } = await supabase
        .from('users')
        .select('role')
        .eq('id', id)
        .single();
      if (targetUser && (targetUser.role === 'master' || targetUser.role === 'sub_master')) {
        return NextResponse.json({ error: '마스터 계정은 수정할 수 없습니다' }, { status: 403 });
      }
      // sub_master가 부여 가능한 role: teacher, accountant, auditor
      if (role !== undefined && !['teacher', 'accountant', 'auditor'].includes(role)) {
        return NextResponse.json({ error: '부여할 수 없는 권한입니다' }, { status: 403 });
      }
    }

    // master도 자기 자신의 master role은 변경 불가 (보호)
    if (profile.role === 'master' && id === profile.id && role !== undefined && role !== 'master') {
      return NextResponse.json({ error: '자신의 마스터 권한은 변경할 수 없습니다' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    if (role !== undefined) updateData.role = role;
    if (status !== undefined) updateData.status = status;
    if (position !== undefined) updateData.position = position;
    if (department_id !== undefined) updateData.department_id = department_id;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: '수정할 항목이 없습니다' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: `사용자 수정에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    // 승인(active) 또는 사용자 정보 수정 시 Auth 이메일 인증 처리 (미인증 계정 로그인 차단 방지)
    const serviceClient = createServiceClient();
    await serviceClient.auth.admin.updateUserById(id, { email_confirm: true });

    return NextResponse.json({ data });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}

// DELETE: 사용자 삭제 (master 전용)
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (!profile || profile.status !== 'active' || profile.role !== 'master') {
      return NextResponse.json({ error: '마스터 권한이 필요합니다' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '사용자 ID가 필요합니다' }, { status: 400 });
    }

    // 자기 자신 삭제 방지
    if (id === authUser.id) {
      return NextResponse.json({ error: '자기 자신은 삭제할 수 없습니다' }, { status: 403 });
    }

    // users 테이블에서 삭제
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return NextResponse.json({ error: `사용자 삭제 실패: ${deleteError.message}` }, { status: 500 });
    }

    // Supabase Auth에서도 삭제 (service client 필요)
    const serviceClient = createServiceClient();
    await serviceClient.auth.admin.deleteUser(id);

    return NextResponse.json({ data: { message: '사용자가 삭제되었습니다' } });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}
