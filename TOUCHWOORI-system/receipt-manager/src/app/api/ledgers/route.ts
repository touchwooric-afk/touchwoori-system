export const runtime = 'nodejs';

import { createServerClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

// 전체 부서 장부 열람 가능한 역할
const CROSS_DEPT_ROLES = ['master', 'sub_master', 'auditor', 'overseer', 'admin_viewer'];

// GET: 장부 목록 조회
// - 일반 사용자: 본인 부서만
// - cross-dept 역할: department_id 쿼리 파라미터로 필터링 가능, 없으면 전체
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

    const { searchParams } = new URL(request.url);
    const deptParam = searchParams.get('department_id');

    const isCrossDept = CROSS_DEPT_ROLES.includes(profile.role);
    const targetDept = isCrossDept
      ? (deptParam || null)           // cross-dept: 파라미터 있으면 해당 부서, 없으면 전체
      : profile.department_id;        // 일반: 본인 부서 강제

    let query = supabase
      .from('ledgers')
      .select('*')
      .order('department_id', { ascending: true })
      .order('type', { ascending: true })
      .order('created_at', { ascending: true });

    if (targetDept) {
      query = query.eq('department_id', targetDept);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: `장부 목록 조회에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}

// POST: 장부 생성 (accountant 또는 master)
export async function POST(request: NextRequest) {
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

    if (profile.role !== 'master' && profile.role !== 'accountant') {
      return NextResponse.json({ error: '회계 담당자 이상의 권한이 필요합니다' }, { status: 403 });
    }

    const body = await request.json();
    const { name, type, description } = body;

    if (!name || !type) {
      return NextResponse.json({ error: '이름과 유형은 필수입니다' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('ledgers')
      .insert({
        name,
        type,
        description: description || null,
        department_id: profile.department_id,
        created_by: authUser.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: `장부 생성에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}

// PATCH: 장부 수정 (accountant 또는 master)
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

    if (profile.role !== 'master' && profile.role !== 'accountant') {
      return NextResponse.json({ error: '회계 담당자 이상의 권한이 필요합니다' }, { status: 403 });
    }

    const body = await request.json();
    const { id, name, description, is_active } = body;

    if (!id) {
      return NextResponse.json({ error: '장부 ID가 필요합니다' }, { status: 400 });
    }

    // 기존 장부 확인
    const { data: existingLedger } = await supabase
      .from('ledgers')
      .select('*')
      .eq('id', id)
      .single();

    if (!existingLedger) {
      return NextResponse.json({ error: '장부를 찾을 수 없습니다' }, { status: 404 });
    }

    // 본 장부(main)는 비활성화 불가
    if (existingLedger.type === 'main' && is_active === false) {
      return NextResponse.json({ error: '본 장부는 비활성화할 수 없습니다' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (is_active !== undefined) updateData.is_active = is_active;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: '수정할 항목이 없습니다' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('ledgers')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: `장부 수정에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}

// DELETE: 장부 삭제 (master 전용, 종료된 특수 장부만)
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role, status')
      .eq('id', authUser.id)
      .single();

    if (!profile || profile.status !== 'active' || profile.role !== 'master') {
      return NextResponse.json({ error: '마스터 권한이 필요합니다' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '장부 ID가 필요합니다' }, { status: 400 });
    }

    const { data: ledger } = await supabase
      .from('ledgers')
      .select('id, name, type, is_active')
      .eq('id', id)
      .single();

    if (!ledger) {
      return NextResponse.json({ error: '장부를 찾을 수 없습니다' }, { status: 404 });
    }
    if (ledger.type === 'main') {
      return NextResponse.json({ error: '본 장부는 삭제할 수 없습니다' }, { status: 400 });
    }
    if (ledger.is_active) {
      return NextResponse.json({ error: '종료된 장부만 삭제할 수 있습니다' }, { status: 400 });
    }

    // ledger_entries는 ON DELETE CASCADE로 자동 삭제됨
    const { error } = await supabase
      .from('ledgers')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: `장부 삭제에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ data: { message: '장부가 삭제되었습니다' } });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}
