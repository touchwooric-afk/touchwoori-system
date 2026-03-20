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

      const insertData = entries.map((entry: {
        date: string;
        description: string;
        income: number;
        expense: number;
        category_id: string;
        memo?: string;
      }) => ({
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
        row_count: insertData.length,
        status: 'success',
        created_by: authUser.id,
      });

      return NextResponse.json({
        data: {
          message: `${data.length}건의 항목이 등록되었습니다`,
          entries: data,
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
      // 항목명: 첫 번째 '항목' 컬럼. 중복 컬럼은 XLSX이 '항목', '항목_1'로 구분.
      const description = (row['항목'] || row['설명'] || row['내용'] || '') as string;
      // 수입: 입금액 / 수입액 / 수입
      const income = parseFloat(String(row['입금액'] || row['수입액'] || row['수입'] || 0)) || 0;
      // 지출: 출금액 / 지출액 / 지출
      const expense = parseFloat(String(row['출금액'] || row['지출액'] || row['지출'] || 0)) || 0;
      // 카테고리: 두 번째 '항목' 컬럼(중복으로 '항목_1') 또는 '카테고리', '분류'
      const categoryName = (row['항목_1'] || row['카테고리'] || row['분류'] || '') as string;
      // 정규화 이름 매칭 → 키워드 폴백 매칭 순서로 시도
      const categoryId =
        categoryNameMap.get(normalize(categoryName)) ||
        matchCategoryByKeyword(categoryName) ||
        null;

      // 날짜 파싱
      let date = '';
      const rawDate = row['날짜'] || row['일자'];
      if (rawDate) {
        if (typeof rawDate === 'number') {
          // 엑셀 시리얼 넘버
          const excelDate = XLSX.SSF.parse_date_code(rawDate);
          date = `${excelDate.y}-${String(excelDate.m).padStart(2, '0')}-${String(excelDate.d).padStart(2, '0')}`;
        } else {
          const parsed = new Date(String(rawDate));
          if (!isNaN(parsed.getTime())) {
            date = parsed.toISOString().split('T')[0];
          }
        }
      }

      return {
        rowIndex: index + 1,
        date,
        description: String(description),
        income,
        expense,
        categoryName: categoryName || null,
        categoryId,
        // 날짜 + 항목명 + 금액(수입 or 지출) 모두 있어야 유효
        isValid: !!(date && description && (income > 0 || expense > 0)),
      };
    });

    return NextResponse.json({
      data: {
        filename: file.name,
        totalRows: preview.length,
        validRows: preview.filter((r) => r.isValid).length,
        ledgerId,
        preview,
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}
