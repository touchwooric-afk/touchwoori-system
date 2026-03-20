import { createServerClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

// GET: 정산 기간 목록 조회 (활성 사용자)
export async function GET() {
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

    const { data, error } = await supabase
      .from('settlements')
      .select('*')
      .order('start_date', { ascending: false });

    if (error) {
      return NextResponse.json({ error: `정산 기간 목록 조회에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}

// POST: 정산 기간 생성 (master 전용)
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
    const { title, start_date, end_date, memo } = body;

    if (!title || !start_date || !end_date) {
      return NextResponse.json({ error: '제목, 시작일, 종료일은 필수입니다' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('settlements')
      .insert({
        title,
        start_date,
        end_date,
        memo: memo || null,
        created_by: authUser.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: `정산 기간 생성에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}

// PATCH: 정산 기간 수정 (master 전용)
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
    const { id, title, start_date, end_date, memo } = body;

    if (!id) {
      return NextResponse.json({ error: '정산 기간 ID가 필요합니다' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (start_date !== undefined) updateData.start_date = start_date;
    if (end_date !== undefined) updateData.end_date = end_date;
    if (memo !== undefined) updateData.memo = memo;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: '수정할 항목이 없습니다' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('settlements')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: `정산 기간 수정에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}

// DELETE: 정산 기간 삭제 (master 전용)
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

    if (!profile || profile.status !== 'active') {
      return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 });
    }

    if (profile.role !== 'master') {
      return NextResponse.json({ error: '마스터 권한이 필요합니다' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const idsParam = searchParams.get('ids');

    const idsToDelete = idsParam
      ? idsParam.split(',').map((s) => s.trim()).filter(Boolean)
      : id ? [id] : [];

    if (idsToDelete.length === 0) {
      return NextResponse.json({ error: '정산 기간 ID가 필요합니다' }, { status: 400 });
    }

    const { error } = await supabase
      .from('settlements')
      .delete()
      .in('id', idsToDelete);

    if (error) {
      return NextResponse.json({ error: `정산 기간 삭제에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ data: { message: `${idsToDelete.length}건의 정산 기간이 삭제되었습니다` } });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}
