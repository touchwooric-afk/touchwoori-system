import { createServerClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

// GET: 직분 목록 조회 (인증 불필요 - 회원가입 폼에서 사용)
export async function GET() {
  try {
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from('positions')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      return NextResponse.json({ error: `직분 목록 조회에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}

// POST: 직분 생성 (master 전용)
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

    if (profile.role !== 'master') {
      return NextResponse.json({ error: '마스터 권한이 필요합니다' }, { status: 403 });
    }

    const body = await request.json();
    const { name, sort_order } = body;

    if (!name) {
      return NextResponse.json({ error: '직분 이름은 필수입니다' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('positions')
      .insert({
        name,
        sort_order: sort_order || 0,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: `직분 생성에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}

// PATCH: 직분 수정 (master 전용)
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

    if (profile.role !== 'master') {
      return NextResponse.json({ error: '마스터 권한이 필요합니다' }, { status: 403 });
    }

    const body = await request.json();
    const { id, name, sort_order, is_active } = body;

    if (!id) {
      return NextResponse.json({ error: '직분 ID가 필요합니다' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (sort_order !== undefined) updateData.sort_order = sort_order;
    if (is_active !== undefined) updateData.is_active = is_active;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: '수정할 항목이 없습니다' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('positions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: `직분 수정에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}
