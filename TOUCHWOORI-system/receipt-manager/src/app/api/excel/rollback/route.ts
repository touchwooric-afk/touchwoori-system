export const runtime = 'nodejs';

import { createServerClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

// GET: 특정 장부의 마지막 import 이력 조회
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

    const { data: profile } = await supabase
      .from('users')
      .select('role, department_id, status')
      .eq('id', authUser.id)
      .single();

    if (!profile || profile.status !== 'active') {
      return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 });
    }
    if (profile.role !== 'master' && profile.role !== 'accountant') {
      return NextResponse.json({ error: '회계 담당자 이상의 권한이 필요합니다' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const ledgerId = searchParams.get('ledgerId');
    if (!ledgerId) return NextResponse.json({ data: null });

    const { data: sync } = await supabase
      .from('excel_syncs')
      .select('id, created_at, row_count, filename')
      .eq('type', 'import')
      .eq('ledger_id', ledgerId)
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({ data: sync ?? null });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE: 마지막 import 롤백
// — 해당 sync 이후 생성된 excel_import 항목 삭제 + sync 레코드 삭제
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

    const { data: profile } = await supabase
      .from('users')
      .select('role, department_id, status')
      .eq('id', authUser.id)
      .single();

    if (!profile || profile.status !== 'active') {
      return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 });
    }
    if (profile.role !== 'master' && profile.role !== 'accountant') {
      return NextResponse.json({ error: '회계 담당자 이상의 권한이 필요합니다' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const ledgerId = searchParams.get('ledgerId');
    const syncId = searchParams.get('syncId');
    if (!ledgerId || !syncId) {
      return NextResponse.json({ error: 'ledgerId, syncId가 필요합니다' }, { status: 400 });
    }

    // 장부 부서 확인
    const { data: ledger } = await supabase
      .from('ledgers')
      .select('department_id')
      .eq('id', ledgerId)
      .single();

    if (!ledger || (profile.role === 'accountant' && ledger.department_id !== profile.department_id)) {
      return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 });
    }

    // sync 레코드 확인 (타인 sync 롤백 방지)
    const { data: sync } = await supabase
      .from('excel_syncs')
      .select('id, created_at, row_count')
      .eq('id', syncId)
      .eq('ledger_id', ledgerId)
      .eq('type', 'import')
      .single();

    if (!sync) {
      return NextResponse.json({ error: '가져오기 이력을 찾을 수 없습니다' }, { status: 404 });
    }

    // 해당 sync 이후 생성된 excel_import 항목 삭제
    const { data: deleted, error: delError } = await supabase
      .from('ledger_entries')
      .delete()
      .eq('ledger_id', ledgerId)
      .eq('source', 'excel_import')
      .gte('created_at', sync.created_at)
      .select('id');

    if (delError) {
      return NextResponse.json({ error: `삭제에 실패했습니다: ${delError.message}` }, { status: 500 });
    }

    // sync 레코드 삭제
    await supabase.from('excel_syncs').delete().eq('id', syncId);

    return NextResponse.json({
      data: {
        deletedCount: deleted?.length ?? 0,
        message: `${deleted?.length ?? 0}건이 장부에서 제거되었습니다`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
