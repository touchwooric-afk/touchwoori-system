export const runtime = 'edge';

import { createServerClient, createServiceClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

// GET: 장부 항목 목록 조회
// - type=main 장부: 부서 내 모든 장부 항목 집계 (전체 장부 뷰)
// - type=special 장부: 해당 장부 항목만 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: ledgerId } = await params;
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

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const categoryId = searchParams.get('categoryId');
    const search = searchParams.get('search');
    const receiptFilter = searchParams.get('receiptFilter');
    const offset = (page - 1) * pageSize;

    const isAmountSearch = search ? /^[\d,]+$/.test(search.trim()) : false;
    const searchAmount = isAmountSearch ? parseInt(search!.replace(/,/g, '')) : 0;

    const { data: ledger } = await supabase
      .from('ledgers')
      .select('department_id, type')
      .eq('id', ledgerId)
      .single();

    if (!ledger) {
      return NextResponse.json({ error: '장부를 찾을 수 없습니다' }, { status: 404 });
    }

    if (ledger.department_id !== profile.department_id) {
      return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 });
    }

    // 전체 장부(main)이면 부서 내 모든 장부 ID + 이름 수집
    const isMainLedger = ledger.type === 'main';
    let ledgerIds: string[] = [ledgerId];
    const ledgerNameMap: Record<string, string> = {};

    if (isMainLedger) {
      const { data: deptLedgers } = await supabase
        .from('ledgers')
        .select('id, name')
        .eq('department_id', ledger.department_id)
        .eq('is_active', true);
      const list = (deptLedgers || []) as { id: string; name: string }[];
      ledgerIds = list.map(l => l.id);
      for (const l of list) ledgerNameMap[l.id] = l.name;
    }

    const serviceClient = createServiceClient();

    let query = serviceClient
      .from('ledger_entries')
      .select('*, categories(*), receipts!receipt_id(id, image_url)', { count: 'exact' });

    if (isMainLedger) {
      query = query.in('ledger_id', ledgerIds);
    } else {
      query = query.eq('ledger_id', ledgerId);
    }

    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);
    if (categoryId) query = query.eq('category_id', categoryId);
    if (search) {
      if (isAmountSearch) {
        query = query.or(`description.ilike.%${search}%,income.eq.${searchAmount},expense.eq.${searchAmount}`);
      } else {
        query = query.ilike('description', `%${search}%`);
      }
    }
    if (receiptFilter === 'income-all') {
      query = query.gt('income', 0);
    } else if (receiptFilter === 'expense-all') {
      query = query.gt('expense', 0);
    } else if (receiptFilter === 'linked') {
      query = query.not('receipt_id', 'is', null).gt('expense', 0);
    } else if (receiptFilter === 'unlinked') {
      query = query.is('receipt_id', null).gt('expense', 0);
    }

    query = query
      .order('date', { ascending: true })
      .order('description', { ascending: true })
      .order('income', { ascending: true })
      .order('expense', { ascending: true })
      .range(offset, offset + pageSize - 1);

    const { data: entries, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: `장부 항목 조회에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    // 전체 합계 (필터 적용, 페이지 무관)
    let sumQuery = supabase
      .from('ledger_entries')
      .select('income, expense, receipt_id');
    if (isMainLedger) {
      sumQuery = sumQuery.in('ledger_id', ledgerIds);
    } else {
      sumQuery = sumQuery.eq('ledger_id', ledgerId);
    }
    if (startDate) sumQuery = sumQuery.gte('date', startDate);
    if (endDate) sumQuery = sumQuery.lte('date', endDate);
    if (categoryId) sumQuery = sumQuery.eq('category_id', categoryId);
    if (search) {
      if (isAmountSearch) {
        sumQuery = sumQuery.or(`description.ilike.%${search}%,income.eq.${searchAmount},expense.eq.${searchAmount}`);
      } else {
        sumQuery = sumQuery.ilike('description', `%${search}%`);
      }
    }
    const { data: allEntries } = await sumQuery;

    const totalAll = (allEntries || []).length;
    const totalIncome = (allEntries || []).reduce((s, e) => s + (e.income || 0), 0);
    const totalExpense = (allEntries || []).reduce((s, e) => s + (e.expense || 0), 0);
    const totalIncomeEntries = (allEntries || []).filter(e => (e.income || 0) > 0).length;
    const expenseAll = (allEntries || []).filter(e => (e.expense || 0) > 0);
    const totalLinked = expenseAll.filter(e => e.receipt_id !== null).length;
    const totalUnlinked = expenseAll.filter(e => e.receipt_id === null).length;

    // 현재 페이지 이전 누적잔액 계산
    let previousBalance = 0;
    if (offset > 0) {
      let prevQuery = supabase
        .from('ledger_entries')
        .select('income, expense');
      if (isMainLedger) {
        prevQuery = prevQuery.in('ledger_id', ledgerIds);
      } else {
        prevQuery = prevQuery.eq('ledger_id', ledgerId);
      }

      if (startDate) prevQuery = prevQuery.gte('date', startDate);
      if (endDate) prevQuery = prevQuery.lte('date', endDate);
      if (categoryId) prevQuery = prevQuery.eq('category_id', categoryId);
      if (search) {
        if (isAmountSearch) {
          prevQuery = prevQuery.or(`description.ilike.%${search}%,income.eq.${searchAmount},expense.eq.${searchAmount}`);
        } else {
          prevQuery = prevQuery.ilike('description', `%${search}%`);
        }
      }

      prevQuery = prevQuery
        .order('date', { ascending: true })
        .order('description', { ascending: true })
        .order('income', { ascending: true })
        .order('expense', { ascending: true })
        .range(0, offset - 1);

      const { data: prevEntries } = await prevQuery;
      if (prevEntries) {
        previousBalance = prevEntries.reduce(
          (sum, e) => sum + (e.income || 0) - (e.expense || 0),
          0
        );
      }
    }

    let runningBalance = previousBalance;
    const entriesWithBalance = (entries || []).map((entry) => {
      runningBalance += (entry.income || 0) - (entry.expense || 0);
      return {
        ...entry,
        category: entry.categories,
        categories: undefined,
        ledger_name: isMainLedger ? (ledgerNameMap[entry.ledger_id] ?? null) : undefined,
        balance: runningBalance,
      };
    });

    return NextResponse.json({
      data: entriesWithBalance,
      total: count || 0,
      page,
      pageSize,
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
      totalAll: totalAll ?? 0,
      totalIncomeEntries: totalIncomeEntries ?? 0,
      totalLinked: totalLinked ?? 0,
      totalUnlinked: totalUnlinked ?? 0,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}

// POST: 장부 항목 생성 (accountant 또는 master, 배치 입력 지원)
// - target_ledger_id: 전체 장부에서 특정 장부로 저장할 때 사용
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: ledgerId } = await params;
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

    if (profile.role !== 'master' && profile.role !== 'accountant' && profile.role !== 'sub_master') {
      return NextResponse.json({ error: '회계 담당자 이상의 권한이 필요합니다' }, { status: 403 });
    }

    const { data: ledger } = await supabase
      .from('ledgers')
      .select('department_id')
      .eq('id', ledgerId)
      .single();

    if (!ledger) {
      return NextResponse.json({ error: '장부를 찾을 수 없습니다' }, { status: 404 });
    }

    if (ledger.department_id !== profile.department_id) {
      return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 });
    }

    const body = await request.json();
    const { entries, target_ledger_id } = body;

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: '항목 데이터가 필요합니다' }, { status: 400 });
    }

    // target_ledger_id가 지정된 경우 해당 장부가 같은 부서인지 확인
    let actualLedgerId = ledgerId;
    if (target_ledger_id && target_ledger_id !== ledgerId) {
      const { data: targetLedger } = await supabase
        .from('ledgers')
        .select('department_id, is_active')
        .eq('id', target_ledger_id)
        .single();
      if (!targetLedger || targetLedger.department_id !== ledger.department_id || !targetLedger.is_active) {
        return NextResponse.json({ error: '잘못된 대상 장부입니다' }, { status: 400 });
      }
      actualLedgerId = target_ledger_id;
    }

    const insertData = entries.map((entry: {
      date: string;
      description: string;
      income?: number;
      expense?: number;
      category_id: string;
      memo?: string;
    }) => ({
      ledger_id: actualLedgerId,
      date: entry.date,
      description: entry.description,
      income: entry.income || 0,
      expense: entry.expense || 0,
      category_id: entry.category_id,
      memo: entry.memo || null,
      source: 'manual' as const,
      created_by: authUser.id,
    }));

    const { data, error } = await supabase
      .from('ledger_entries')
      .insert(insertData)
      .select();

    if (error) {
      return NextResponse.json({ error: `장부 항목 생성에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}

// PATCH: 장부 항목 수정 (accountant 또는 master)
// - 전체 장부에서 하위 장부 항목도 수정 가능 (같은 부서 내)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: ledgerId } = await params;
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

    const isEditor = profile.role === 'master' || profile.role === 'accountant' || profile.role === 'sub_master';
    const isTeacher = profile.role === 'teacher';

    if (!isEditor && !isTeacher) {
      return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 });
    }

    const body = await request.json();
    const { id, ledger_id, date, description, income, expense, category_id, memo, receipt_id } = body;

    if (isTeacher && (ledger_id !== undefined || date !== undefined || description !== undefined || income !== undefined || expense !== undefined || category_id !== undefined || memo !== undefined)) {
      return NextResponse.json({ error: '영수증 연결만 허용됩니다' }, { status: 403 });
    }

    if (!id) {
      return NextResponse.json({ error: '항목 ID가 필요합니다' }, { status: 400 });
    }

    // 현재 장부 정보 (전체 장부 여부 확인용)
    const { data: currentLedger } = await supabase
      .from('ledgers')
      .select('department_id, type')
      .eq('id', ledgerId)
      .single();

    if (!currentLedger) {
      return NextResponse.json({ error: '장부를 찾을 수 없습니다' }, { status: 404 });
    }

    const { data: existingEntry } = await supabase
      .from('ledger_entries')
      .select('ledger_id')
      .eq('id', id)
      .single();

    if (!existingEntry) {
      return NextResponse.json({ error: '항목을 찾을 수 없습니다' }, { status: 404 });
    }

    if (currentLedger.type === 'main') {
      // 전체 장부: 같은 부서의 어떤 장부 항목이든 수정 가능
      const { data: entryLedger } = await supabase
        .from('ledgers')
        .select('department_id')
        .eq('id', existingEntry.ledger_id)
        .single();
      if (entryLedger?.department_id !== currentLedger.department_id) {
        return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 });
      }
    } else {
      // 특정 장부: 해당 장부 항목만 수정 가능
      if (existingEntry.ledger_id !== ledgerId) {
        return NextResponse.json({ error: '해당 장부의 항목이 아닙니다' }, { status: 400 });
      }
    }

    const updateData: Record<string, unknown> = {};
    if (ledger_id !== undefined && ledger_id !== existingEntry.ledger_id) {
      const { data: targetLedger } = await supabase
        .from('ledgers')
        .select('department_id, is_active')
        .eq('id', ledger_id)
        .single();

      if (!targetLedger || !targetLedger.is_active || targetLedger.department_id !== currentLedger.department_id) {
        return NextResponse.json({ error: '잘못된 대상 장부입니다' }, { status: 400 });
      }

      updateData.ledger_id = ledger_id;
    }
    if (date !== undefined) updateData.date = date;
    if (description !== undefined) updateData.description = description;
    if (income !== undefined) updateData.income = income;
    if (expense !== undefined) updateData.expense = expense;
    if (category_id !== undefined) updateData.category_id = category_id;
    if (memo !== undefined) updateData.memo = memo;
    if (receipt_id !== undefined) updateData.receipt_id = receipt_id;
    updateData.updated_at = new Date().toISOString();

    if (Object.keys(updateData).length <= 1) {
      return NextResponse.json({ error: '수정할 항목이 없습니다' }, { status: 400 });
    }

    const updateClient = isTeacher ? createServiceClient() : supabase;
    const { data, error } = await updateClient
      .from('ledger_entries')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: `장부 항목 수정에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}

// DELETE: 장부 항목 삭제 (accountant 또는 master)
// - 전체 장부에서 하위 장부 항목도 삭제 가능 (같은 부서 내)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: ledgerId } = await params;
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

    if (profile.role !== 'master' && profile.role !== 'accountant' && profile.role !== 'sub_master') {
      return NextResponse.json({ error: '회계 담당자 이상의 권한이 필요합니다' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const entryId = searchParams.get('id');
    const entryIds = searchParams.get('ids');

    const idsToDelete: string[] = entryIds
      ? entryIds.split(',').map((s) => s.trim()).filter(Boolean)
      : entryId
        ? [entryId]
        : [];

    if (idsToDelete.length === 0) {
      return NextResponse.json({ error: '항목 ID가 필요합니다' }, { status: 400 });
    }

    // 현재 장부 정보
    const { data: currentLedger } = await supabase
      .from('ledgers')
      .select('department_id, type')
      .eq('id', ledgerId)
      .single();

    if (!currentLedger) {
      return NextResponse.json({ error: '장부를 찾을 수 없습니다' }, { status: 404 });
    }

    const { data: existingEntries } = await supabase
      .from('ledger_entries')
      .select('id, ledger_id')
      .in('id', idsToDelete);

    if (!existingEntries || existingEntries.length !== idsToDelete.length) {
      return NextResponse.json({ error: '일부 항목을 찾을 수 없습니다' }, { status: 404 });
    }

    if (currentLedger.type === 'main') {
      // 전체 장부: 같은 부서의 어떤 장부 항목이든 삭제 가능
      const { data: deptLedgers } = await supabase
        .from('ledgers')
        .select('id')
        .eq('department_id', currentLedger.department_id);
      const deptLedgerIds = new Set((deptLedgers || []).map((l: { id: string }) => l.id));
      const unauthorized = existingEntries.find((e) => !deptLedgerIds.has(e.ledger_id));
      if (unauthorized) {
        return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 });
      }
    } else {
      // 특정 장부: 해당 장부 항목만 삭제 가능
      const unauthorized = existingEntries.find((e) => e.ledger_id !== ledgerId);
      if (unauthorized) {
        return NextResponse.json({ error: '해당 장부의 항목이 아닙니다' }, { status: 400 });
      }
    }

    const { error } = await supabase
      .from('ledger_entries')
      .delete()
      .in('id', idsToDelete);

    if (error) {
      return NextResponse.json({ error: `장부 항목 삭제에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ data: { message: `${idsToDelete.length}건의 항목이 삭제되었습니다` } });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}
