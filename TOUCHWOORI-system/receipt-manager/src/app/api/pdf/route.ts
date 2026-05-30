export const runtime = 'edge';

import { createServerClient, createServiceClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

const PDF_QUERY_PAGE_SIZE = 1000;
const CARRYOVER_KEYWORD = '이월금';

async function fetchAllRows<T>(
  buildQuery: () => any,
  label: string
): Promise<{ data: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PDF_QUERY_PAGE_SIZE) {
    const to = from + PDF_QUERY_PAGE_SIZE - 1;
    const { data, error } = await buildQuery().range(from, to);

    if (error) {
      return { data: rows, error: `${label} 조회에 실패했습니다: ${error.message}` };
    }

    const page = (data || []) as T[];
    rows.push(...page);

    if (page.length < PDF_QUERY_PAGE_SIZE) {
      return { data: rows, error: null };
    }
  }
}

// POST: 정산서 PDF 데이터 생성 (PDF 렌더링은 클라이언트에서 @react-pdf/renderer로 처리)
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

    const body = await request.json();
    const { startDate, endDate, ledgerId, title } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: '시작일과 종료일은 필수입니다' },
        { status: 400 }
      );
    }

    // Teacher는 자기 부서만 접근 가능
    // ledgerId가 지정된 경우 해당 장부의 부서 확인
    let targetLedgerId = ledgerId;
    let targetDepartmentId = profile.department_id;
    let targetLedgerType: 'main' | 'special' = 'main';

    if (targetLedgerId) {
      const { data: ledger } = await supabase
        .from('ledgers')
        .select('department_id, type')
        .eq('id', targetLedgerId)
        .single();

      if (!ledger) {
        return NextResponse.json({ error: '장부를 찾을 수 없습니다' }, { status: 404 });
      }

      if (profile.role === 'teacher' && ledger.department_id !== profile.department_id) {
        return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 });
      }

      targetDepartmentId = ledger.department_id;
      targetLedgerType = ledger.type;
    } else {
      // ledgerId 미지정 시 부서의 전체 장부(main)를 사용
      const { data: mainLedger } = await supabase
        .from('ledgers')
        .select('id, department_id, type')
        .eq('department_id', profile.department_id)
        .eq('type', 'main')
        .eq('is_active', true)
        .single();

      if (!mainLedger) {
        return NextResponse.json(
          { error: '부서의 전체 장부를 찾을 수 없습니다' },
          { status: 400 }
        );
      }

      targetLedgerId = mainLedger.id;
      targetDepartmentId = mainLedger.department_id;
      targetLedgerType = mainLedger.type;
    }

    // receipts RLS는 teacher를 제외하므로 serviceClient로 조회 (API 레벨 권한 검증 완료 후)
    const serviceClient = createServiceClient();

    let ledgerIds = [targetLedgerId];
    if (targetLedgerType === 'main') {
      const { data: deptLedgers, error: ledgerListError } = await supabase
        .from('ledgers')
        .select('id')
        .eq('department_id', targetDepartmentId)
        .eq('is_active', true);

      if (ledgerListError) {
        return NextResponse.json({ error: `장부 목록 조회에 실패했습니다: ${ledgerListError.message}` }, { status: 500 });
      }

      ledgerIds = (deptLedgers || []).map((l) => l.id);
    }

    const buildPriorQuery = () => {
      let query = serviceClient
        .from('ledger_entries')
        .select('income, expense')
        .lt('date', startDate)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true });

      return targetLedgerType === 'main'
        ? query.in('ledger_id', ledgerIds)
        : query.eq('ledger_id', targetLedgerId);
    };

    const { data: priorEntries, error: priorError } = await fetchAllRows<{
      income: number | null;
      expense: number | null;
    }>(buildPriorQuery, '이월 장부 항목');

    if (priorError) {
      return NextResponse.json({ error: priorError }, { status: 500 });
    }

    const priorBalance = (priorEntries || []).reduce(
      (sum, e) => sum + (e.income || 0) - (e.expense || 0), 0
    );

    const buildEntriesQuery = () => {
      let query = serviceClient
        .from('ledger_entries')
        .select('*, categories(*), receipts!receipt_id(id, image_url)')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true });

      return targetLedgerType === 'main'
        ? query.in('ledger_id', ledgerIds)
        : query.eq('ledger_id', targetLedgerId);
    };

    const { data: allEntries, error } = await fetchAllRows<any>(buildEntriesQuery, '기간 내 장부 항목');

    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }

    const isCarryoverEntry = (entry: { date: string; description: string }) => (
      entry.date === startDate && entry.description.includes(CARRYOVER_KEYWORD)
    );
    const carryoverEntries = (allEntries || []).filter(isCarryoverEntry);
    const carryoverEntryAmount = carryoverEntries.reduce(
      (sum, entry) => sum + (entry.income || 0) - (entry.expense || 0),
      0
    );
    const carryoverBalance = priorBalance + carryoverEntryAmount;
    const carryoverLabel = carryoverEntries.length > 0
      ? '전년도 이월금'
      : `${startDate} 직전 잔액`;

    // 카테고리별 수입/지출 합계 집계
    const incomeCatMap = new Map<string, { category: string; total: number }>();
    const expenseCatMap = new Map<string, { category: string; total: number }>();

    const incomeItems: Array<{ date: string; description: string; amount: number; categoryName: string }> = [];
    const expenseItems: Array<{ date: string; description: string; amount: number; categoryName: string; imageUrl: string | null }> = [];

    let totalIncome = 0;
    let totalExpense = 0;

    for (const entry of allEntries || []) {
      if (isCarryoverEntry(entry)) continue;

      const categoryName = entry.categories?.name || '미분류';

      if ((entry.income || 0) > 0) {
        totalIncome += entry.income;
        const existing = incomeCatMap.get(categoryName);
        if (existing) existing.total += entry.income;
        else incomeCatMap.set(categoryName, { category: categoryName, total: entry.income });

        incomeItems.push({
          date: entry.date,
          description: entry.description,
          amount: entry.income,
          categoryName,
        });
      }

      if ((entry.expense || 0) > 0) {
        totalExpense += entry.expense;
        const existing = expenseCatMap.get(categoryName);
        if (existing) existing.total += entry.expense;
        else expenseCatMap.set(categoryName, { category: categoryName, total: entry.expense });

        expenseItems.push({
          date: entry.date,
          description: entry.description,
          amount: entry.expense,
          categoryName,
          imageUrl: entry.receipts?.image_url || null,
        });
      }
    }

    const incomeSummary = Array.from(incomeCatMap.values()).sort((a, b) => b.total - a.total);
    const expenseSummary = Array.from(expenseCatMap.values()).sort((a, b) => b.total - a.total);
    const endingBalance = carryoverBalance + totalIncome - totalExpense;

    return NextResponse.json({
      data: {
        title: title || `정산서 (${startDate} ~ ${endDate})`,
        period: { startDate, endDate },
        carryoverBalance,
        carryoverLabel,
        totalIncome,
        totalExpense,
        endingBalance,
        incomeSummary,
        expenseSummary,
        incomeItems,
        expenseItems,
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}
