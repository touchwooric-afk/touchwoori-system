export const runtime = 'nodejs';

import { createServerClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/receipts/check-similar?amount=N
 *
 * 같은 부서에서 동일 금액으로 이미 승인(approved)된 영수증 존재 여부 반환.
 * 승인된 항목 = 이미 장부에 연동 완료된 항목. 날짜 조건 없음.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

    const { data: profile } = await supabase
      .from('users')
      .select('department_id, status')
      .eq('id', authUser.id)
      .single();

    if (!profile || profile.status !== 'active') {
      return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const amountStr = searchParams.get('amount');
    const ledgerId = searchParams.get('ledgerId');

    if (!amountStr) {
      return NextResponse.json({ hasSimilar: false });
    }

    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({ hasSimilar: false });
    }

    // ledgerId가 있으면 해당 장부에 연동된 영수증만 비교
    if (ledgerId) {
      const { data: entries } = await supabase
        .from('ledger_entries')
        .select('receipt_id')
        .eq('ledger_id', ledgerId)
        .not('receipt_id', 'is', null);

      const receiptIds = (entries || []).map((e: { receipt_id: string }) => e.receipt_id);
      if (receiptIds.length === 0) return NextResponse.json({ hasSimilar: false });

      const { data } = await supabase
        .from('receipts')
        .select('id, description, date, status, submitted_by, submitter:users!submitted_by(name)')
        .in('id', receiptIds)
        .eq('final_amount', amount)
        .eq('status', 'approved')
        .order('date', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        return NextResponse.json({ hasSimilar: true, similar: data[0] });
      }
      return NextResponse.json({ hasSimilar: false });
    }

    // ledgerId 없으면 부서 전체에서 체크 (기존 동작)
    const { data } = await supabase
      .from('receipts')
      .select('id, description, date, status, submitted_by, submitter:users!submitted_by(name)')
      .eq('department_id', profile.department_id)
      .eq('final_amount', amount)
      .eq('status', 'approved')
      .order('date', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      return NextResponse.json({ hasSimilar: true, similar: data[0] });
    }

    return NextResponse.json({ hasSimilar: false });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}
