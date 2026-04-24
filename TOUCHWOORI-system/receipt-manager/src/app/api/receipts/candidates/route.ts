export const runtime = 'edge';

import { createServerClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/receipts/candidates?ledgerId=&amount=숫자&description=텍스트
 *
 * 금액·항목명 기준으로 장부 항목 후보를 반환합니다 (날짜 무시).
 * receipt_id가 없는 항목(미연결)만 대상.
 *
 * 우선순위:
 *   auto  — 항목명 키워드 일치 + 금액 ±10%
 *   high  — 항목명 키워드 일치만
 *   low   — 금액 ±10%만
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

    const { data: profile } = await supabase
      .from('users')
      .select('role, status, department_id')
      .eq('id', authUser.id)
      .single();

    if (!profile || profile.status !== 'active') {
      return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const ledgerId    = searchParams.get('ledgerId');
    const amountStr   = searchParams.get('amount');
    const description = (searchParams.get('description') || '').trim();

    if (!ledgerId) {
      return NextResponse.json({ error: 'ledgerId가 필요합니다' }, { status: 400 });
    }

    const amount  = amountStr ? parseInt(amountStr, 10) : null;
    const dateStr = searchParams.get('date') || '';

    // 키워드 (2글자 이상 단어만)
    const keywords = description.split(/\s+/).filter((w) => w.length >= 2);

    // 미연동 항목 전체 조회 (최대 200건)
    const { data: entries, error } = await supabase
      .from('ledger_entries')
      .select('id, date, description, income, expense, category_id, categories(name, type)')
      .eq('ledger_id', ledgerId)
      .is('receipt_id', null)
      .order('date', { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ error: `후보 조회 실패: ${error.message}` }, { status: 500 });
    }

    type Confidence = 'auto' | 'high' | 'low';

    const receiptDate = dateStr ? new Date(dateStr) : null;

    const scored = (entries || [])
      .map((entry) => {
        const entryAmount = entry.expense > 0 ? entry.expense : entry.income;

        // 1순위: 금액 정확 일치 (100점)
        const amountMatch = amount != null && entryAmount === amount;

        // 2순위: 항목명 키워드 유사도 (50점)
        const keywordMatch = keywords.length > 0 && keywords.some(
          (kw) => (entry.description || '').toLowerCase().includes(kw.toLowerCase())
        );

        // 3순위: 날짜 근접도 (최대 10점, 영수증 날짜 기준 ±30일)
        let dateScore = 0;
        if (receiptDate) {
          const entryDate = new Date(entry.date);
          const daysDiff = Math.abs((entryDate.getTime() - receiptDate.getTime()) / (1000 * 60 * 60 * 24));
          dateScore = Math.max(0, 10 - Math.floor(daysDiff / 3)); // 3일마다 1점 감소
        }

        const score = (amountMatch ? 100 : 0) + (keywordMatch ? 50 : 0) + dateScore;

        let confidence: Confidence;
        if (amountMatch && keywordMatch) confidence = 'auto';
        else if (amountMatch)            confidence = 'high';
        else                             confidence = 'low';

        return {
          id: entry.id,
          date: entry.date,
          description: entry.description,
          amount: entryAmount,
          category: entry.categories,
          confidence,
          score,
        };
      })
      .filter((e) => e.score >= 50) // 금액 또는 항목명 중 하나 이상 일치해야 표시
      .sort((a, b) => b.score - a.score);

    return NextResponse.json({ data: scored });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}
