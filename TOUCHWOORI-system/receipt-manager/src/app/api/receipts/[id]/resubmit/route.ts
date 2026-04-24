export const runtime = 'edge';

import { createServerClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

// POST: 반려된 영수증 재제출 (제출자 본인만 가능)
// status: rejected → pending, reject_reason 초기화
export async function POST(
  _request: NextRequest,
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
      .select('role, status')
      .eq('id', authUser.id)
      .single();

    if (!profile || profile.status !== 'active') {
      return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 });
    }

    // 영수증 확인
    const { data: receipt } = await supabase
      .from('receipts')
      .select('submitted_by, status')
      .eq('id', id)
      .single();

    if (!receipt) {
      return NextResponse.json({ error: '영수증을 찾을 수 없습니다' }, { status: 404 });
    }

    // 본인 영수증만 재제출 가능
    if (receipt.submitted_by !== authUser.id) {
      return NextResponse.json({ error: '본인의 영수증만 재제출할 수 있습니다' }, { status: 403 });
    }

    // 반려된 영수증만 재제출 가능
    if (receipt.status !== 'rejected') {
      return NextResponse.json({ error: '반려된 영수증만 재제출할 수 있습니다' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('receipts')
      .update({
        status: 'pending',
        reject_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: `재제출에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}
