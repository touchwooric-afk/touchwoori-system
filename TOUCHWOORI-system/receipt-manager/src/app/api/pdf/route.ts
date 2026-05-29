export const runtime = 'edge';

import { createServerClient, createServiceClient } from '@/lib/supabase-server';
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

    // 이월 잔액: startDate 이전의 모든 항목 합산 (수입 - 지출)
    let priorQuery = serviceClient
      .from('ledger_entries')
      .select('income, expense')
      .lt('date', startDate);

    priorQuery = targetLedgerType === 'main'
      ? priorQuery.in('ledger_id', ledgerIds)
      : priorQuery.eq('ledger_id', targetLedgerId);

    const { data: priorEntries } = await priorQuery;

    const carryoverBalance = (priorEntries || []).reduce(
      (sum, e) => sum + (e.income || 0) - (e.expense || 0), 0
    );

    // 기간 내 전체 항목 조회 (수입 + 지출 모두)
    let entriesQuery = serviceClient
      .from('ledger_entries')
      .select('*, categories(*), receipts!receipt_id(id, image_url)')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true });

    entriesQuery = targetLedgerType === 'main'
      ? entriesQuery.in('ledger_id', ledgerIds)
      : entriesQuery.eq('ledger_id', targetLedgerId);

    const { data: allEntries, error } = await entriesQuery;

    if (error) {
      return NextResponse.json({ error: `데이터 조회에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    // 카테고리별 수입/지출 합계 집계
    const incomeCatMap = new Map<string, { category: string; total: number }>();
    const expenseCatMap = new Map<string, { category: string; total: number }>();

    const incomeItems: Array<{ date: string; description: string; amount: number; categoryName: string }> = [];
    const expenseItems: Array<{ date: string; description: string; amount: number; categoryName: string; imageUrl: string | null }> = [];
    const linkedReceiptIds = new Set<string>();

    let totalIncome = 0;
    let totalExpense = 0;

    for (const entry of allEntries || []) {
      const categoryName = entry.categories?.name || '미분류';
      if (entry.receipt_id) linkedReceiptIds.add(entry.receipt_id);

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
    let unlinkedApprovedReceipts: Array<{
      id: string;
      date: string;
      description: string;
      amount: number;
      imageUrl: string | null;
      reason: string;
      linkedEntryDate: string | null;
      linkedLedgerName: string | null;
    }> = [];

    if (targetLedgerType === 'main') {
      const { data: approvedReceipts } = await serviceClient
        .from('receipts')
        .select('id, date, description, final_amount, approved_amount, image_url')
        .eq('department_id', targetDepartmentId)
        .eq('status', 'approved')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

      const approvedReceiptIds = (approvedReceipts || []).map((receipt) => receipt.id);
      const linkedEntriesByReceipt = new Map<string, Array<{
        receipt_id: string;
        ledger_id: string;
        date: string;
        ledgers?: { name?: string | null; is_active?: boolean | null } | null;
      }>>();

      if (approvedReceiptIds.length > 0) {
        const { data: linkedEntries } = await serviceClient
          .from('ledger_entries')
          .select('receipt_id, ledger_id, date, ledgers(name, is_active)')
          .in('receipt_id', approvedReceiptIds);

        for (const rawEntry of linkedEntries || []) {
          const entry = rawEntry as {
            receipt_id: string | null;
            ledger_id: string;
            date: string;
            ledgers?: { name?: string | null; is_active?: boolean | null } | Array<{ name?: string | null; is_active?: boolean | null }> | null;
          };
          if (!entry.receipt_id) continue;
          const ledger = Array.isArray(entry.ledgers) ? entry.ledgers[0] : entry.ledgers;
          const list = linkedEntriesByReceipt.get(entry.receipt_id) || [];
          list.push({
            receipt_id: entry.receipt_id,
            ledger_id: entry.ledger_id,
            date: entry.date,
            ledgers: ledger || null,
          });
          linkedEntriesByReceipt.set(entry.receipt_id, list);
        }
      }

      unlinkedApprovedReceipts = (approvedReceipts || [])
        .map((receipt) => {
          const entries = linkedEntriesByReceipt.get(receipt.id) || [];
          const printableEntry = entries.find((entry) => (
            ledgerIds.includes(entry.ledger_id)
            && entry.date >= startDate
            && entry.date <= endDate
          ));

          if (printableEntry || linkedReceiptIds.has(receipt.id)) return null;

          const sameLedgerEntry = entries.find((entry) => ledgerIds.includes(entry.ledger_id));
          const firstEntry = sameLedgerEntry || entries[0] || null;
          let reason = '장부 항목 연결 없음';

          if (sameLedgerEntry) {
            reason = '장부일이 결산 기간 밖';
          } else if (firstEntry) {
            reason = firstEntry.ledgers?.is_active === false
              ? '비활성 장부에 연결됨'
              : '다른 장부에 연결됨';
          }

          return {
            id: receipt.id,
            date: receipt.date,
            description: receipt.description,
            amount: receipt.approved_amount ?? receipt.final_amount,
            imageUrl: receipt.image_url || null,
            reason,
            linkedEntryDate: firstEntry?.date || null,
            linkedLedgerName: firstEntry?.ledgers?.name || null,
          };
        })
        .filter(Boolean) as typeof unlinkedApprovedReceipts;
    }

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
        diagnostics: {
          unlinkedApprovedReceipts,
          expenseItemsWithoutImage: expenseItems.filter((item) => !item.imageUrl).length,
        },
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}
