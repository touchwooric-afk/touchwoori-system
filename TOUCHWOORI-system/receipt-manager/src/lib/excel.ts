/**
 * 엑셀 처리 유틸리티 (SheetJS)
 */
import type { LedgerEntryWithBalance } from '@/types';

/**
 * 엑셀 파일 파싱 + 컬럼 매핑 (가져오기 미리보기)
 */
export async function parseExcelFile(file: File) {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  // 컬럼 매핑
  return rows.map((row, index) => {
    const description =
      (row['항목'] as string) ||
      (row['내용'] as string) ||
      (row['설명'] as string) ||
      '';
    const income =
      Number(row['수입액'] || row['수입'] || 0);
    const expense =
      Number(row['지출액'] || row['지출'] || 0);
    const dateRaw =
      (row['날짜'] as string) || (row['거래일'] as string) || '';
    const categoryName =
      (row['카테고리'] as string) || (row['분류'] as string) || '';
    const memo =
      (row['비고'] as string) || (row['메모'] as string) || '';

    // 날짜 파싱
    let date = '';
    if (dateRaw) {
      if (typeof dateRaw === 'number') {
        // 엑셀 시리얼 날짜
        const d = new Date((dateRaw - 25569) * 86400 * 1000);
        date = d.toISOString().split('T')[0];
      } else {
        const d = new Date(dateRaw);
        if (!isNaN(d.getTime())) {
          date = d.toISOString().split('T')[0];
        }
      }
    }

    return {
      rowNumber: index + 1,
      date,
      description,
      income,
      expense,
      categoryName,
      memo,
      valid: !!(date && description && (income > 0 || expense > 0)),
    };
  });
}

/**
 * 장부 항목을 엑셀 파일로 내보내기
 */
export async function exportToExcel(
  entries: LedgerEntryWithBalance[],
  filename: string
) {
  const XLSX = await import('xlsx');

  const data = entries.map((entry) => ({
    '날짜': entry.date,
    '항목': entry.description,
    '수입액': entry.income || '',
    '지출액': entry.expense || '',
    '잔액': entry.balance,
    '카테고리': entry.category?.name || '',
    '비고': entry.memo || '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '장부');

  // UTF-8 BOM 포함 xlsx 생성
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

  // 다운로드 트리거
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
