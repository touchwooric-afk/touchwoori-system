export const runtime = 'edge';

import { createServerClient, createServiceClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

// GET: 영수증 목록 조회 (역할별 접근 제어)
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('receipts')
      .select('*, submitter:users!submitted_by(name), categories(name, type)', { count: 'exact' });

    const deptParam = searchParams.get('department_id');

    // 역할별 필터링
    if (profile.role === 'teacher') {
      // Teacher: 본인 영수증만
      query = query.eq('submitted_by', authUser.id);
    } else if (profile.role === 'accountant') {
      // Accountant: 같은 부서 영수증
      query = query.eq('department_id', profile.department_id);
    } else {
      // Master·cross-dept: 선택 부서 기준 (파라미터 없으면 전체)
      if (deptParam) query = query.eq('department_id', deptParam);
    }

    if (status) {
      query = query.eq('status', status);
    }
    if (startDate) {
      query = query.gte('date', startDate);
    }
    if (endDate) {
      query = query.lte('date', endDate);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: `영수증 목록 조회에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    // 총 정산요청금액 계산
    let pendingTotal = 0;
    if (profile.role === 'teacher') {
      // teacher: 본인의 승인 대기 총액
      const { data: pendingRows } = await supabase
        .from('receipts')
        .select('final_amount')
        .eq('submitted_by', authUser.id)
        .eq('status', 'pending');
      pendingTotal = (pendingRows || []).reduce((s, r) => s + (r.final_amount || 0), 0);
    } else if (status === 'pending') {
      // accountant/master: pending 목록 조회 시 전체 pending 합계
      let sumQuery = supabase
        .from('receipts')
        .select('final_amount')
        .eq('status', 'pending');
      if (profile.role === 'accountant') {
        sumQuery = sumQuery.eq('department_id', profile.department_id);
      }
      const { data: sumRows } = await sumQuery;
      pendingTotal = (sumRows || []).reduce((s, r) => s + (r.final_amount || 0), 0);
    }

    // pending 조회 시: 장부 항목 expense 금액과 대조해 중복 플래그 추가
    let enrichedData = data || [];
    if (status === 'pending' && enrichedData.length > 0) {
      // 부서의 활성 장부 조회
      const { data: ledgers } = await supabase
        .from('ledgers')
        .select('id')
        .eq('department_id', profile.role === 'accountant' ? profile.department_id : (profile.department_id ?? ''))
        .eq('is_active', true);

      if (ledgers && ledgers.length > 0) {
        const ledgerIds = ledgers.map((l: { id: string }) => l.id);
        // 장부 항목 expense 금액 목록 (이미 영수증 연동된 항목 제외)
        const { data: ledgerExpenses } = await supabase
          .from('ledger_entries')
          .select('expense')
          .in('ledger_id', ledgerIds)
          .gt('expense', 0);

        const ledgerExpenseAmounts = new Set(
          (ledgerExpenses || []).map((e: { expense: number }) => e.expense)
        );

        enrichedData = enrichedData.map((r: Record<string, unknown>) => ({
          ...r,
          has_ledger_match: ledgerExpenseAmounts.has(r.final_amount as number),
        }));
      }
    }

    return NextResponse.json({
      data: enrichedData,
      total: count || 0,
      page,
      pageSize,
      pendingTotal,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}

// POST: 영수증 생성 (모든 활성 사용자)
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
    const {
      date,
      description,
      final_amount,
      category_id,
      image_url,
      vendor,
      subtotal,
      discount,
      delivery_fee,
      memo,
      ocr_raw,
      skip_auto_ledger, // 기존 장부 항목에 연결할 때 중복 생성 방지
      skip_duplicate_check, // 기존 항목 연결 시 중복 검사 스킵
      ledger_id, // 선택한 장부 ID (중복 체크 범위 한정용)
      bank_name,
      account_holder,
      account_number,
    } = body;

    // 유효성 검사
    if (!date || !description || final_amount === undefined || !category_id) {
      return NextResponse.json(
        { error: '날짜, 설명, 최종 금액, 카테고리는 필수입니다' },
        { status: 400 }
      );
    }

    if (typeof description !== 'string' || description.length < 1 || description.length > 200) {
      return NextResponse.json(
        { error: '설명은 1자 이상 200자 이하로 입력해주세요' },
        { status: 400 }
      );
    }

    if (typeof final_amount !== 'number' || final_amount < 0 || final_amount > 99999999) {
      return NextResponse.json(
        { error: '최종 금액은 0원 이상 99,999,999원 이하로 입력해주세요' },
        { status: 400 }
      );
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date) || isNaN(new Date(date).getTime())) {
      return NextResponse.json(
        { error: '유효한 날짜 형식이 아닙니다 (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    // 중복 영수증 검사 — 선택한 장부 내에서만, 없으면 부서 전체에서
    if (!skip_duplicate_check) {
      let duplicate = null;

      if (ledger_id) {
        // 선택한 장부에 연동된 영수증 중에서만 중복 체크
        const { data: entries } = await supabase
          .from('ledger_entries')
          .select('receipt_id')
          .eq('ledger_id', ledger_id)
          .not('receipt_id', 'is', null);

        const receiptIds = (entries || []).map((e: { receipt_id: string }) => e.receipt_id);
        if (receiptIds.length > 0) {
          const { data } = await supabase
            .from('receipts')
            .select('id, description, date, final_amount, status')
            .in('id', receiptIds)
            .eq('final_amount', final_amount)
            .neq('status', 'rejected')
            .limit(1)
            .maybeSingle();
          duplicate = data;
        }
      } else {
        // 장부 미선택 시 부서 전체에서 체크 (기존 동작)
        const { data } = await supabase
          .from('receipts')
          .select('id, description, date, final_amount, status, submitted_by')
          .eq('department_id', profile.department_id)
          .eq('final_amount', final_amount)
          .neq('status', 'rejected')
          .limit(1)
          .maybeSingle();
        duplicate = data;
      }

      if (duplicate) {
        return NextResponse.json({
          error: '동일한 금액의 영수증이 이미 존재합니다. 중복 제출일 수 있습니다.',
          code: 'DUPLICATE',
          can_override: true,
          existing: {
            id: duplicate.id,
            description: duplicate.description,
            date: duplicate.date,
            final_amount: duplicate.final_amount,
            status: duplicate.status,
          },
        }, { status: 409 });
      }
    }

    // accountant / master가 직접 올리면 즉시 승인 처리
    const isEditor = profile.role === 'master' || profile.role === 'accountant';
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('receipts')
      .insert({
        date,
        description,
        final_amount,
        category_id,
        image_url: image_url || null,
        vendor: vendor || null,
        subtotal: subtotal ?? null,
        discount: discount ?? null,
        delivery_fee: delivery_fee ?? null,
        memo: memo || null,
        ocr_raw: ocr_raw || null,
        submitted_by: authUser.id,
        department_id: profile.department_id,
        status: isEditor ? 'approved' : 'pending',
        reviewed_by: isEditor ? authUser.id : null,
        reviewed_at: isEditor ? now : null,
        bank_name: bank_name || null,
        account_holder: account_holder || null,
        account_number: account_number || null,
        has_duplicate_warning: body.has_duplicate_warning || false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: `영수증 생성에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    // 즉시 승인된 경우 장부 항목 자동 생성 (기존 항목 연결 시엔 건너뜀)
    if (isEditor && data && !skip_auto_ledger) {
      let targetLedgerId: string | null = null;

      if (ledger_id) {
        // 선택한 장부가 있으면 해당 장부에 추가
        const { data: selectedLedger } = await supabase
          .from('ledgers')
          .select('id')
          .eq('id', ledger_id)
          .eq('department_id', profile.department_id)
          .eq('is_active', true)
          .single();
        targetLedgerId = selectedLedger?.id ?? null;
      }

      if (!targetLedgerId) {
        // 장부 미선택 시 본 장부(main)에 추가
        const { data: mainLedger } = await supabase
          .from('ledgers')
          .select('id')
          .eq('department_id', profile.department_id)
          .eq('type', 'main')
          .eq('is_active', true)
          .single();
        targetLedgerId = mainLedger?.id ?? null;
      }

      if (targetLedgerId) {
        await supabase.from('ledger_entries').insert({
          ledger_id: targetLedgerId,
          receipt_id: data.id,
          category_id: data.category_id,
          date: data.date,
          description: data.description,
          income: 0,
          expense: data.final_amount,
          memo: data.memo || null,
          source: 'receipt',
          created_by: authUser.id,
        });
      }
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}

// DELETE: 영수증 일괄 삭제 (?ids=id1,id2,...)
export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get('ids');
    if (!idsParam) {
      return NextResponse.json({ error: '삭제할 ID가 필요합니다' }, { status: 400 });
    }
    const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json({ error: '삭제할 ID가 필요합니다' }, { status: 400 });
    }

    // 대상 영수증 조회
    const { data: receipts, error: selectError } = await supabase
      .from('receipts')
      .select('id, image_url, submitted_by, status, department_id')
      .in('id', ids);

    if (selectError) {
      return NextResponse.json({
        error: `영수증 조회 실패: ${selectError.message}`,
        detail: `IDs: ${ids.join(', ')}`
      }, { status: 500 });
    }

    if (!receipts || receipts.length !== ids.length) {
      const foundIds = receipts?.map((r: any) => r.id) || [];
      const missingIds = ids.filter((id: string) => !foundIds.includes(id));
      return NextResponse.json({
        error: '일부 영수증을 찾을 수 없습니다',
        detail: `요청: ${ids.length}건, 조회됨: ${receipts?.length || 0}건`,
        missingIds,
      }, { status: 404 });
    }

    // 역할별 권한 검증
    for (const receipt of receipts) {
      if (profile.role === 'teacher') {
        if (receipt.submitted_by !== authUser.id) {
          return NextResponse.json({ error: '본인의 영수증만 삭제할 수 있습니다' }, { status: 403 });
        }
        if (receipt.status !== 'pending') {
          return NextResponse.json({ error: '대기 중인 영수증만 삭제할 수 있습니다' }, { status: 400 });
        }
      } else if (profile.role === 'accountant') {
        if (receipt.department_id !== profile.department_id) {
          return NextResponse.json({ error: '같은 부서의 영수증만 삭제할 수 있습니다' }, { status: 403 });
        }
      }
    }

    // ledger_entries의 receipt_id FK 해제 (FK 제약 위반 방지)
    // RLS가 교사의 ledger_entries UPDATE를 차단하므로 서비스 클라이언트 사용
    const serviceClient = createServiceClient();
    await serviceClient
      .from('ledger_entries')
      .update({ receipt_id: null })
      .in('receipt_id', ids);

    // 이미지 Storage 삭제 (실패 무시)
    const imagePaths = receipts
      .filter((r) => r.image_url)
      .map((r) => {
        try {
          const url = new URL(r.image_url!);
          const m = url.pathname.match(/\/storage\/v1\/object\/public\/receipts\/(.+)/);
          return m ? m[1] : null;
        } catch { return null; }
      })
      .filter(Boolean) as string[];

    if (imagePaths.length > 0) {
      try {
        const serviceClient = createServiceClient();
        await serviceClient.storage.from('receipts').remove(imagePaths);
      } catch { /* 이미지 삭제 실패 무시 */ }
    }

    const { error } = await serviceClient.from('receipts').delete().in('id', ids);
    if (error) {
      return NextResponse.json({ error: `영수증 삭제에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ data: { message: `${ids.length}건의 영수증이 삭제되었습니다` } });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}
