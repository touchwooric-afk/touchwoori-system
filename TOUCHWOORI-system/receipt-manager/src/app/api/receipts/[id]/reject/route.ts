import { createServerClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

// POST: 영수증 반려 (accountant 또는 master)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    // 영수증 조회
    const { data: receipt } = await supabase
      .from('receipts')
      .select('*')
      .eq('id', id)
      .single();

    if (!receipt) {
      return NextResponse.json({ error: '영수증을 찾을 수 없습니다' }, { status: 404 });
    }

    // accountant는 같은 부서만
    if (profile.role === 'accountant' && receipt.department_id !== profile.department_id) {
      return NextResponse.json({ error: '같은 부서의 영수증만 반려할 수 있습니다' }, { status: 403 });
    }

    if (receipt.status !== 'pending') {
      return NextResponse.json({ error: '대기 중인 영수증만 반려할 수 있습니다' }, { status: 400 });
    }

    let body: { reject_reason?: string } = {};
    try {
      body = await request.json();
    } catch (err) {
      // body가 없어도 허용
    }

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('receipts')
      .update({
        status: 'rejected',
        reviewed_by: authUser.id,
        reviewed_at: now,
        reject_reason: body.reject_reason || null,
        updated_at: now,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: `영수증 반려에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        message: '영수증이 반려되었습니다',
        receipt: data,
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}
