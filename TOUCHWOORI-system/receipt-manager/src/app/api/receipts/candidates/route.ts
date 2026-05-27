export const runtime = 'edge';

import { createServerClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

const CROSS_DEPT_ROLES = ['master', 'sub_master', 'auditor', 'overseer', 'admin_viewer'];

/**
 * GET /api/receipts/candidates?ledgerId=&amount=숫자&description=텍스트&manual=true
 *
 * 금액·항목명 기준으로 장부 항목 후보를 반환합니다.
 * receipt_id가 없는 항목(미연결)만 대상.
 *
 * 우선순위:
 *   auto  — 항목명 키워드 일치 + 금액 정확 일치
 *   high  — 금액 정확 일치
 *   low   — 항목명 키워드 일치
 *
 * manual=true일 때는 자동매칭 점수 조건을 느슨하게 적용합니다.
 * date 또는 month(YYYY-MM)가 함께 전달되면 해당 월의 미연동 장부 항목을 전부 반환해
 * 키워드 매칭이 실패해도 사용자가 직접 고를 수 있게 합니다.
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
    const manual      = searchParams.get('manual') === 'true';

    if (!ledgerId) {
      return NextResponse.json({ error: 'ledgerId가 필요합니다' }, { status: 400 });
    }

    const { data: selectedLedger, error: ledgerError } = await supabase
      .from('ledgers')
      .select('id, name, type, department_id, is_active')
      .eq('id', ledgerId)
      .single();

    if (ledgerError || !selectedLedger) {
      return NextResponse.json({ error: '장부를 찾을 수 없습니다' }, { status: 404 });
    }

    const canCrossDept = CROSS_DEPT_ROLES.includes(profile.role);
    if (!canCrossDept && selectedLedger.department_id !== profile.department_id) {
      return NextResponse.json({ error: '해당 장부에 접근할 수 없습니다' }, { status: 403 });
    }

    let ledgerIds = [ledgerId];
    if (selectedLedger.type === 'main') {
      const { data: deptLedgers, error: deptLedgerError } = await supabase
        .from('ledgers')
        .select('id')
        .eq('department_id', selectedLedger.department_id)
        .eq('is_active', true);

      if (deptLedgerError) {
        return NextResponse.json({ error: `장부 목록 조회 실패: ${deptLedgerError.message}` }, { status: 500 });
      }
      ledgerIds = (deptLedgers || []).map((l) => l.id);
    }

    const amount  = amountStr ? parseInt(amountStr, 10) : null;
    const dateStr = searchParams.get('date') || '';
    const monthParam = searchParams.get('month') || '';

    // 키워드 (2글자 이상 단어만)
    const keywords = description.split(/\s+/).filter((w) => w.length >= 2);

    const monthKey = /^\d{4}-\d{2}$/.test(monthParam)
      ? monthParam
      : /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
        ? dateStr.slice(0, 7)
        : '';
    const manualMonth = manual && Boolean(monthKey);
    const monthStart = manualMonth ? `${monthKey}-01` : '';
    const monthEnd = manualMonth
      ? new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0).toISOString().slice(0, 10)
      : '';

    // 미연동 항목 조회. 수동 검색은 특정 월 전체 탐색을 우선합니다.
    let query = supabase
      .from('ledger_entries')
      .select('id, date, description, income, expense, category_id, ledger_id, categories(name, type), ledgers(name)')
      .in('ledger_id', ledgerIds)
      .is('receipt_id', null)
      .order('date', { ascending: false });

    if (manualMonth) {
      query = query.gte('date', monthStart).lte('date', monthEnd).limit(1000);
    } else {
      query = query.limit(manual ? 500 : 200);
    }

    const { data: entries, error } = await query;

    if (error) {
      return NextResponse.json({ error: `후보 조회 실패: ${error.message}` }, { status: 500 });
    }

    type Confidence = 'auto' | 'high' | 'low';

    const receiptDate = dateStr ? new Date(dateStr) : null;

    const scored = (entries || [])
      .map((entry) => {
        const entryAmount = entry.expense > 0 ? entry.expense : entry.income;
        const entryDescription = (entry.description || '').toLowerCase();
        const descriptionLower = description.toLowerCase();

        // 1순위: 금액 정확 일치 (100점)
        const amountMatch = amount != null && entryAmount === amount;

        // 2순위: 항목명 키워드 유사도 (50점)
        const keywordMatch = keywords.length > 0 && keywords.some((kw) =>
          entryDescription.includes(kw.toLowerCase())
        );
        const phraseMatch = manual && descriptionLower.length > 0 && entryDescription.includes(descriptionLower);

        const sameMonth = manualMonth && entry.date >= monthStart && entry.date <= monthEnd;

        // 3순위: 날짜 근접도 (최대 10점, 영수증 날짜 기준 ±30일)
        let dateScore = 0;
        if (receiptDate) {
          const entryDate = new Date(entry.date);
          const daysDiff = Math.abs((entryDate.getTime() - receiptDate.getTime()) / (1000 * 60 * 60 * 24));
          dateScore = Math.max(0, 10 - Math.floor(daysDiff / 3)); // 3일마다 1점 감소
        }

        const score = (amountMatch ? 100 : 0) + (keywordMatch || phraseMatch ? 50 : 0) + dateScore;

        let confidence: Confidence;
        if (amountMatch && (keywordMatch || phraseMatch)) confidence = 'auto';
        else if (amountMatch)            confidence = 'high';
        else                             confidence = 'low';

        const ledgerRelation = entry.ledgers as { name?: string } | { name?: string }[] | null;
        const ledgerName = Array.isArray(ledgerRelation) ? ledgerRelation[0]?.name : ledgerRelation?.name;

        return {
          id: entry.id,
          date: entry.date,
          description: entry.description,
          amount: entryAmount,
          category_id: entry.category_id,
          category: entry.categories,
          ledger_id: entry.ledger_id,
          ledger_name: ledgerName,
          confidence,
          score,
          sameMonth,
        };
      })
      .filter((e) => {
        if (!manual) return e.score >= 50; // 금액 또는 항목명 중 하나 이상 일치해야 표시
        if (manualMonth && e.sameMonth) return true;
        if (!amount && keywords.length === 0) return true;
        return e.score > 0;
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.date.localeCompare(a.date);
      })
      .slice(0, manualMonth ? 1000 : manual ? 50 : 200);

    return NextResponse.json({ data: scored });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}
