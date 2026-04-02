export const runtime = 'nodejs';

import { createServerClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

// POST: 엑셀 데이터 가져오기 (accountant 또는 master)
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

    const contentType = request.headers.get('content-type') || '';

    // JSON 요청: 확인 후 실제 삽입
    if (contentType.includes('application/json')) {
      const body = await request.json();
      const { confirm, ledgerId, entries } = body;

      if (!confirm || !ledgerId || !entries || !Array.isArray(entries)) {
        return NextResponse.json(
          { error: '확인 데이터가 올바르지 않습니다' },
          { status: 400 }
        );
      }

      // 장부 존재 및 부서 확인
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

      // 기존 항목 조회 → 중복 키 셋 구성 (날짜+항목명+금액)
      const { data: existingEntries } = await supabase
        .from('ledger_entries')
        .select('date, description, income, expense')
        .eq('ledger_id', ledgerId);

      const nd = (s: string) => s.trim().replace(/\s+/g, ' ');

      const existingKeys = new Set(
        (existingEntries || []).map((e) =>
          `${e.date}|${nd(e.description)}|${e.income || 0}|${e.expense || 0}`
        )
      );

      type EntryInput = {
        date: string;
        description: string;
        income: number;
        expense: number;
        category_id: string;
        memo?: string;
      };

      const newEntries: EntryInput[] = [];
      const skippedEntries: EntryInput[] = [];

      for (const entry of entries as EntryInput[]) {
        const key = `${entry.date}|${nd(entry.description)}|${entry.income || 0}|${entry.expense || 0}`;
        if (existingKeys.has(key)) {
          skippedEntries.push(entry);
        } else {
          newEntries.push(entry);
        }
      }

      if (newEntries.length === 0) {
        return NextResponse.json({
          data: {
            message: `추가된 항목이 없습니다 (${skippedEntries.length}건 중복 스킵)`,
            entries: [],
            insertedCount: 0,
            skippedCount: skippedEntries.length,
          },
        }, { status: 201 });
      }

      const insertData = newEntries.map((entry) => ({
        ledger_id: ledgerId,
        date: entry.date,
        description: entry.description,
        income: entry.income || 0,
        expense: entry.expense || 0,
        category_id: entry.category_id,
        memo: entry.memo || null,
        source: 'excel_import' as const,
        created_by: authUser.id,
      }));

      const { data, error } = await supabase
        .from('ledger_entries')
        .insert(insertData)
        .select();

      if (error) {
        return NextResponse.json({ error: `데이터 삽입에 실패했습니다: ${error.message}` }, { status: 500 });
      }

      // 엑셀 동기화 기록
      await supabase.from('excel_syncs').insert({
        type: 'import',
        filename: 'excel_import.xlsx',
        row_count: data.length,
        status: 'success',
        ledger_id: ledgerId,
        created_by: authUser.id,
      });

      const skippedMsg = skippedEntries.length > 0 ? ` (${skippedEntries.length}건 중복 스킵)` : '';
      return NextResponse.json({
        data: {
          message: `${data.length}건 추가됨${skippedMsg}`,
          entries: data,
          insertedCount: data.length,
          skippedCount: skippedEntries.length,
        },
      }, { status: 201 });
    }

    // FormData 요청: 파일 파싱 후 미리보기 반환
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const ledgerId = formData.get('ledgerId') as string;

    if (!file) {
      return NextResponse.json({ error: '파일이 필요합니다' }, { status: 400 });
    }

    if (!ledgerId) {
      return NextResponse.json({ error: '장부 ID가 필요합니다' }, { status: 400 });
    }

    // 장부 존재 및 부서 확인
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

    // 카테고리 목록 조회 (이름 + 키워드 매칭용)
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name, keywords')
      .eq('is_active', true);

    const normalize = (s: string) => s.replace(/\s+/g, '').toLowerCase();

    // 1차: 정규화된 이름 → id 맵
    const categoryNameMap = new Map<string, string>();
    (categories || []).forEach((cat) => {
      categoryNameMap.set(normalize(cat.name), cat.id);
    });

    // 키워드 폴백 매칭 함수
    const matchCategoryByKeyword = (name: string): string | null => {
      const lower = name.toLowerCase();
      for (const cat of categories || []) {
        const kws: string[] = Array.isArray(cat.keywords) ? cat.keywords : JSON.parse(cat.keywords || '[]');
        if (kws.some((kw: string) => lower.includes(kw.toLowerCase()) || kw.toLowerCase().includes(lower))) {
          return cat.id;
        }
      }
      return null;
    };

    // 기존 항목 조회 → 중복 키 셋 구성
    const { data: existingEntries } = await supabase
      .from('ledger_entries')
      .select('date, description, income, expense')
      .eq('ledger_id', ledgerId);

    // 설명 정규화: 앞뒤 공백 제거 + 내부 연속 공백 → 단일 공백
    const normalizeDesc = (s: string) => s.trim().replace(/\s+/g, ' ');

    // 완전 중복 키: 날짜+설명+금액
    const existingKeys = new Set(
      (existingEntries || []).map((e) =>
        `${e.date}|${normalizeDesc(e.description)}|${e.income || 0}|${e.expense || 0}`
      )
    );
    // 날짜+금액 키: 설명이 달라도 경고용
    const existingAmountKeys = new Set(
      (existingEntries || []).map((e) =>
        `${e.date}|${e.income || 0}|${e.expense || 0}`
      )
    );

    // 엑셀 파싱
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

    if (jsonData.length === 0) {
      return NextResponse.json({ error: '데이터가 없습니다' }, { status: 400 });
    }

    // 컬럼 매핑
    const preview = jsonData.map((row, index) => {
      const description = (row['항목'] || row['설명'] || row['내용'] || '') as string;
      // 콤마 포함 텍스트 셀 대응 ("941,521" → 941521)
      const parseAmt = (v: unknown) => parseFloat(String(v).replace(/,/g, '')) || 0;
      const income = parseAmt(row['입금액'] ?? row['수입액'] ?? row['수입'] ?? 0);
      const expense = parseAmt(row['출금액'] ?? row['지출액'] ?? row['지출'] ?? 0);
      const categoryName = (row['항목_1'] || row['카테고리'] || row['분류'] || '') as string;
      const categoryId =
        categoryNameMap.get(normalize(categoryName)) ||
        matchCategoryByKeyword(categoryName) ||
        null;

      let date = '';
      const rawDate = row['날짜'] || row['일자'];
      if (rawDate) {
        if (typeof rawDate === 'number') {
          // 6자리 숫자 YYMMDD (e.g. 251201 → 2025-12-01)
          const n = rawDate;
          if (n >= 100000 && n <= 999999) {
            const yy = Math.floor(n / 10000);
            const mm = Math.floor((n % 10000) / 100);
            const dd = n % 100;
            const yyyy = yy <= 99 ? 2000 + yy : yy;
            date = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
          } else {
            // 엑셀 시리얼 넘버
            const excelDate = XLSX.SSF.parse_date_code(rawDate);
            date = `${excelDate.y}-${String(excelDate.m).padStart(2, '0')}-${String(excelDate.d).padStart(2, '0')}`;
          }
        } else {
          const s = String(rawDate).trim();
          // YYMMDD 또는 YYYYMMDD 숫자 문자열
          const compact = s.replace(/[-./]/g, '');
          if (/^\d{6}$/.test(compact)) {
            const yy = parseInt(compact.slice(0, 2), 10);
            const mm = compact.slice(2, 4);
            const dd = compact.slice(4, 6);
            date = `${2000 + yy}-${mm}-${dd}`;
          } else if (/^\d{8}$/.test(compact)) {
            date = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
          } else {
            // "M월 D일" 형식
            const korean = s.match(/(\d{1,4})년?\s*(\d{1,2})월\s*(\d{1,2})일/);
            if (korean) {
              const y = korean[1].length <= 2 ? 2000 + parseInt(korean[1], 10) : parseInt(korean[1], 10);
              date = `${y}-${String(parseInt(korean[2], 10)).padStart(2, '0')}-${String(parseInt(korean[3], 10)).padStart(2, '0')}`;
            } else {
              const parsed = new Date(s);
              if (!isNaN(parsed.getTime())) {
                date = parsed.toISOString().split('T')[0];
              }
            }
          }
        }
      }

      const isValid = !!(date && description && (income > 0 || expense > 0));
      const isDuplicate = isValid && existingKeys.has(`${date}|${normalizeDesc(String(description))}|${income}|${expense}`);
      // 날짜+금액 일치하지만 설명이 다른 경우 → 경고
      const isSimilar = isValid && !isDuplicate && existingAmountKeys.has(`${date}|${income}|${expense}`);

      return {
        rowIndex: index + 1,
        date,
        description: String(description),
        income,
        expense,
        categoryName: categoryName || null,
        categoryId,
        isValid,
        isDuplicate,
        isSimilar,
      };
    });

    return NextResponse.json({
      data: {
        filename: file.name,
        totalRows: preview.length,
        validRows: preview.filter((r) => r.isValid && !r.isDuplicate).length,
        duplicateRows: preview.filter((r) => r.isDuplicate).length,
        ledgerId,
        preview,
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}
