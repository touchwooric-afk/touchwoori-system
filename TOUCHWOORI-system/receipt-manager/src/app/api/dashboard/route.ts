export const runtime = 'nodejs';

import { createServerClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

const CROSS_DEPT_ROLES = ['master', 'sub_master', 'auditor', 'overseer', 'admin_viewer'];

// GET: 대시보드 차트용 통계 데이터
// 반환: 최근 6개월 월별 수입/지출 + 월별 카테고리별 지출 맵
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role, department_id, status')
      .eq('id', authUser.id)
      .single();

    if (!profile || profile.status !== 'active') {
      return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 });
    }

    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const startDate = sixMonthsAgo.toISOString().split('T')[0];

    let ledgerQuery = supabase
      .from('ledger_entries')
      .select(`
        date,
        income,
        expense,
        category_id,
        categories(name, type),
        ledgers!inner(department_id, is_active)
      `)
      .gte('date', startDate)
      .eq('ledgers.is_active', true);

    const { searchParams } = new URL(request.url);
    const deptParam = searchParams.get('department_id');

    // cross-dept 역할: 선택된 부서 기준, 일반 역할: 본인 부서 고정
    const targetDept = CROSS_DEPT_ROLES.includes(profile.role)
      ? (deptParam || profile.department_id)
      : profile.department_id;

    ledgerQuery = ledgerQuery.eq('ledgers.department_id', targetDept);

    const { data: entries } = await ledgerQuery;

    if (!entries) {
      return NextResponse.json({ data: { monthly: [], monthlyCategoryExpense: {} } });
    }

    // ─── 최근 6개월 키 목록 (YYYY-MM) ────────────────────────
    const monthKeys: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    // ─── 월별 수입/지출 집계 ──────────────────────────────────
    const monthlyMap: Record<string, { income: number; expense: number }> = {};
    for (const key of monthKeys) monthlyMap[key] = { income: 0, expense: 0 };

    // ─── 월별 카테고리별 지출 집계 ───────────────────────────
    const monthlyCatMap: Record<string, Record<string, { name: string; value: number }>> = {};
    for (const key of monthKeys) monthlyCatMap[key] = {};

    for (const entry of entries) {
      const key = entry.date.substring(0, 7);
      if (!monthlyMap[key]) continue;

      monthlyMap[key].income += entry.income || 0;
      monthlyMap[key].expense += entry.expense || 0;

      if (entry.expense && entry.expense > 0) {
        const catRaw = entry.categories;
        const cat = Array.isArray(catRaw)
          ? (catRaw[0] as { name: string } | undefined)
          : (catRaw as { name: string } | null);
        if (cat) {
          const catId = entry.category_id;
          if (!monthlyCatMap[key][catId]) {
            monthlyCatMap[key][catId] = { name: cat.name, value: 0 };
          }
          monthlyCatMap[key][catId].value += entry.expense;
        }
      }
    }

    const monthly = monthKeys.map((key) => {
      const [year, month] = key.split('-');
      return {
        key,                          // YYYY-MM (클라이언트에서 필터용)
        month: `${year}.${Number(month)}`, // 표시용
        income: monthlyMap[key].income,
        expense: monthlyMap[key].expense,
      };
    });

    // 월별 카테고리 지출 → 정렬된 배열로 변환
    const monthlyCategoryExpense: Record<string, { name: string; value: number }[]> = {};
    for (const key of monthKeys) {
      monthlyCategoryExpense[key] = Object.values(monthlyCatMap[key])
        .filter((c) => c.value > 0)
        .sort((a, b) => b.value - a.value);
    }

    return NextResponse.json({ data: { monthly, monthlyCategoryExpense } });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}
