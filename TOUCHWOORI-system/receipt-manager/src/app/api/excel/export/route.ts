export const runtime = 'nodejs';

import { createServerClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

// POST: 장부 항목을 엑셀로 내보내기 (accountant 또는 master)
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

    if (profile.role !== 'master' && profile.role !== 'accountant') {
      return NextResponse.json({ error: '회계 담당자 이상의 권한이 필요합니다' }, { status: 403 });
    }

    const body = await request.json();
    const { ledgerId, startDate, endDate } = body;

    if (!ledgerId) {
      return NextResponse.json({ error: '장부 ID가 필요합니다' }, { status: 400 });
    }

    // 장부 존재 및 부서 확인
    const { data: ledger } = await supabase
      .from('ledgers')
      .select('department_id, name')
      .eq('id', ledgerId)
      .single();

    if (!ledger) {
      return NextResponse.json({ error: '장부를 찾을 수 없습니다' }, { status: 404 });
    }

    if (ledger.department_id !== profile.department_id) {
      return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 });
    }

    // 장부 항목 조회
    let query = supabase
      .from('ledger_entries')
      .select('*, categories(name)')
      .eq('ledger_id', ledgerId)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true });

    if (startDate) {
      query = query.gte('date', startDate);
    }
    if (endDate) {
      query = query.lte('date', endDate);
    }

    const { data: entries, error } = await query;

    if (error) {
      return NextResponse.json({ error: `데이터 조회에 실패했습니다: ${error.message}` }, { status: 500 });
    }

    // Running balance 계산 및 엑셀 데이터 구성
    let runningBalance = 0;

    // 시작일 이전의 잔액 계산 (startDate가 있는 경우)
    if (startDate) {
      const { data: prevEntries } = await supabase
        .from('ledger_entries')
        .select('income, expense')
        .eq('ledger_id', ledgerId)
        .lt('date', startDate);

      if (prevEntries) {
        runningBalance = prevEntries.reduce(
          (sum, e) => sum + (e.income || 0) - (e.expense || 0),
          0
        );
      }
    }

    const excelData = (entries || []).map((entry) => {
      runningBalance += (entry.income || 0) - (entry.expense || 0);
      return {
        '날짜': entry.date,
        '항목': entry.description,
        '수입액': entry.income || 0,
        '지출액': entry.expense || 0,
        '잔액': runningBalance,
        '카테고리': entry.categories?.name || '',
      };
    });

    // 엑셀 워크북 생성
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // 컬럼 너비 설정
    worksheet['!cols'] = [
      { wch: 12 },  // 날짜
      { wch: 30 },  // 항목
      { wch: 15 },  // 수입액
      { wch: 15 },  // 지출액
      { wch: 15 },  // 잔액
      { wch: 15 },  // 카테고리
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '장부');

    // 엑셀 파일을 버퍼로 변환
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // UTF-8 BOM + 엑셀 바이너리
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const combined = new Uint8Array(bom.length + excelBuffer.length);
    combined.set(bom, 0);
    combined.set(new Uint8Array(excelBuffer), bom.length);

    // 파일명 생성
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = encodeURIComponent(`${ledger.name}_${dateStr}.xlsx`);

    // 엑셀 동기화 기록
    await supabase.from('excel_syncs').insert({
      type: 'export',
      filename: `${ledger.name}_${dateStr}.xlsx`,
      row_count: excelData.length,
      status: 'success',
      created_by: authUser.id,
    });

    return new NextResponse(combined, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}
