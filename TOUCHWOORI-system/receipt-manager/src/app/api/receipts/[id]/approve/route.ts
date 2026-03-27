import { createServerClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

// POST: 영수증 승인 (accountant 또는 master, 배치 승인 지원)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    if (profile.role !== 'master' && profile.role !== 'accountant') {
      return NextResponse.json({ error: '회계 담당자 이상의 권한이 필요합니다' }, { status: 403 });
    }

    // 배치 승인 지원: body에 receiptIds가 있으면 배치, 없으면 단건
    let body: { receiptIds?: string[] } = {};
    try {
      body = await request.json();
    } catch (err) {
      // body가 없으면 단건 처리
    }

    const receiptIds = body.receiptIds && body.receiptIds.length > 0
      ? body.receiptIds
      : [id];

    const now = new Date().toISOString();
    const results: { approved: string[]; failed: string[] } = { approved: [], failed: [] };

    // 부서의 본 장부(main) 찾기
    const { data: mainLedger } = await supabase
      .from('ledgers')
      .select('id')
      .eq('department_id', profile.department_id)
      .eq('type', 'main')
      .eq('is_active', true)
      .single();

    if (!mainLedger) {
      return NextResponse.json(
        { error: '부서의 본 장부를 찾을 수 없습니다. 장부를 먼저 생성해주세요.' },
        { status: 400 }
      );
    }

    // 배치가 아닌 단건이고 ledgerEntryId가 있으면 기존 항목 연동
    const { ledgerEntryId, entryOverrides, approved_amount } = body as {
      receiptIds?: string[];
      ledgerEntryId?: string;
      approved_amount?: number;
      entryOverrides?: { date?: string; description?: string; income?: number; expense?: number; category_id?: string };
    };
    const isLinkMode = !body.receiptIds && !!ledgerEntryId;

    for (const receiptId of receiptIds) {
      // 영수증 조회
      const { data: receipt } = await supabase
        .from('receipts')
        .select('*')
        .eq('id', receiptId)
        .single();

      if (!receipt) {
        results.failed.push(receiptId);
        continue;
      }

      // accountant는 같은 부서만
      if (profile.role === 'accountant' && receipt.department_id !== profile.department_id) {
        results.failed.push(receiptId);
        continue;
      }

      // 이미 처리된 영수증은 스킵
      if (receipt.status !== 'pending') {
        results.failed.push(receiptId);
        continue;
      }

      // 영수증 상태 업데이트 (단건 승인이고 approved_amount가 있으면 저장)
      const receiptUpdate: Record<string, unknown> = {
        status: 'approved',
        reviewed_by: authUser.id,
        reviewed_at: now,
        updated_at: now,
      };
      if (!body.receiptIds && approved_amount !== undefined) {
        receiptUpdate.approved_amount = approved_amount;
      }
      const { error: updateError } = await supabase
        .from('receipts')
        .update(receiptUpdate)
        .eq('id', receiptId);

      if (updateError) {
        results.failed.push(receiptId);
        continue;
      }

      // 이미 ledger_entry가 연동되어 있으면 새 항목 생성/연동 스킵
      const { data: existingLink } = await supabase
        .from('ledger_entries')
        .select('id')
        .eq('receipt_id', receiptId)
        .maybeSingle();

      if (existingLink) {
        // 교사가 이미 장부 항목에 연동한 경우 — 그냥 승인만
        results.approved.push(receiptId);
        continue;
      }

      if (isLinkMode && ledgerEntryId) {
        // 기존 장부 항목에 영수증 연동
        const { error: linkError } = await supabase
          .from('ledger_entries')
          .update({ receipt_id: receiptId })
          .eq('id', ledgerEntryId);

        if (linkError) {
          await supabase
            .from('receipts')
            .update({ status: 'pending', reviewed_by: null, reviewed_at: null, updated_at: now })
            .eq('id', receiptId);
          results.failed.push(receiptId);
          continue;
        }
      } else {
        // 새 장부 항목 생성 (approved_amount 또는 entryOverrides로 금액 결정)
        const effectiveAmount = approved_amount !== undefined ? approved_amount : receipt.final_amount;
        const cat = entryOverrides?.category_id
          ? (await supabase.from('categories').select('type').eq('id', entryOverrides.category_id).single()).data
          : null;
        const isIncome = cat?.type === 'income';
        const { error: entryError } = await supabase
          .from('ledger_entries')
          .insert({
            ledger_id: mainLedger.id,
            receipt_id: receiptId,
            category_id: entryOverrides?.category_id ?? receipt.category_id,
            date: entryOverrides?.date ?? receipt.date,
            description: entryOverrides?.description ?? receipt.description,
            income: entryOverrides?.income !== undefined ? entryOverrides.income : (isIncome ? effectiveAmount : 0),
            expense: entryOverrides?.expense !== undefined ? entryOverrides.expense : (isIncome ? 0 : effectiveAmount),
            memo: receipt.memo || null,
            source: 'receipt',
            created_by: authUser.id,
          });

        if (entryError) {
          await supabase
            .from('receipts')
            .update({ status: 'pending', reviewed_by: null, reviewed_at: null, updated_at: now })
            .eq('id', receiptId);
          results.failed.push(receiptId);
          continue;
        }
      }

      results.approved.push(receiptId);
    }

    if (results.approved.length === 0 && results.failed.length > 0) {
      return NextResponse.json(
        { error: '영수증 승인에 실패했습니다', data: results },
        { status: 400 }
      );
    }

    return NextResponse.json({
      data: {
        message: `${results.approved.length}건의 영수증이 승인되었습니다`,
        ...results,
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}
