export const runtime = 'nodejs';

import { createServerClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

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

    if (targetLedgerId) {
      const { data: ledger } = await supabase
        .from('ledgers')
        .select('department_id')
        .eq('id', targetLedgerId)
        .single();

      if (!ledger) {
        return NextResponse.json({ error: '장부를 찾을 수 없습니다' }, { status: 404 });
      }

      if (profile.role === 'teacher' && ledger.department_id !== profile.department_id) {
        return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 });
      }
    } else {
      // ledgerId 미지정 시 부서의 본 장부 사용
      const { data: mainLedger } = await supabase
        .from('ledgers')
        .select('id')
        .eq('department_id', profile.department_id)
        .eq('type', 'main')
        .eq('is_active', true)
        .single();

      if (!mainLedger) {
        return NextResponse.json(
          { error: '부서의 본 장부를 찾을 수 없습니다' },
          { status: 400 }
        );
      }

      targetLedgerId = mainLedger.id;
    }

    // 이월 잔액: startDate 이전의 모든 항목 합산 (수입 - 지출)
    const { data: priorEntries } = await supabase
      .from('ledger_entries')
      .select('income, expense')
      .eq('ledger_id', targetLedgerId)
      .lt('date', startDate);

    const carryoverBalance = (priorEntries || []).reduce(
      (sum, e) => sum + (e.income || 0) - (e.expense || 0), 0
    );

    // 기간 내 전체 항목 조회 (수입 + 지출 모두)
    const { data: allEntries, error } = await supabase
      .from('ledger_entries')
      .select('*, categories(*), receipts!receipt_id(id, image_url)')
      .eq('ledger_id', targetLedgerId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: `데이터 조회에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    // 카테고리별 수입/지출 합계 집계
    const incomeCatMap = new Map<string, { category: string; total: number }>();
    const expenseCatMap = new Map<string, { category: string; total: number }>();

    const incomeItems: Array<{ date: string; description: string; amount: number; categoryName: string }> = [];
    const expenseItems: Array<{ date: string; description: string; amount: number; categoryName: string; imageUrl: string | null }> = [];

    let totalIncome = 0;
    let totalExpense = 0;

    for (const entry of allEntries || []) {
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
