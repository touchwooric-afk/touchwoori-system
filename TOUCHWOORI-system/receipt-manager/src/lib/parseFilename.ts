/**
 * 파일명에서 날짜 / 금액 / 키워드를 추출합니다.
 *
 * 지원 날짜 형식:
 *   YYYYMMDD  → 20251214  → 2025-12-14
 *   YYMMDD    → 251214    → 2025-12-14  ← 사용자 주 사용 형식
 *   MMDD      → 1214      → 올해-12-14
 *   YYYY-MM-DD / YYYY.MM.DD
 *
 * 파일명 예시:
 *   "251214 78000 찬양팀 식사"  → 2025-12-14, 78000, 찬양팀 식사
 *   "20260321_87500_간식"       → 2026-03-21, 87500, 간식
 *   "0321 13000 간식"           → 올해-03-21, 13000, 간식
 *   "IMG_20260321_123456.jpg"   → 2026-03-21 (카메라 자동명)
 */

export interface ParsedFilename {
  date: string | null;   // YYYY-MM-DD
  amount: number | null;
  keyword: string | null;
}

function isValidDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseFilename(filename: string): ParsedFilename {
  // NFC 정규화: macOS 파일명은 NFD(자모 분리)로 저장되어 한글 정규식이 안 먹힘
  const base = filename.normalize('NFC').replace(/\.[^.]+$/, '').replace(/[_\-]/g, ' ').trim();
  const thisYear = new Date().getFullYear();

  let date: string | null = null;
  const usedRanges: [number, number][] = [];

  // ── 날짜 패턴 (긴 것부터 우선 시도) ──────────────────────────

  // 1) YYYY-MM-DD / YYYY.MM.DD (구분자 포함)
  if (!date) {
    const m = base.match(/\b(20\d{2})[.\s](0[1-9]|1[0-2])[.\s](0[1-9]|[12]\d|3[01])\b/);
    if (m) {
      const [y, mo, d] = [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
      if (isValidDate(y, mo, d)) {
        date = toDateStr(y, mo, d);
        const idx = base.indexOf(m[0]);
        usedRanges.push([idx, idx + m[0].length]);
      }
    }
  }

  // 2) YYYYMMDD (8자리, 2000년대)
  if (!date) {
    const re = /\b(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(base)) !== null) {
      const [y, mo, d] = [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
      if (isValidDate(y, mo, d)) {
        date = toDateStr(y, mo, d);
        usedRanges.push([m.index, m.index + m[0].length]);
        break;
      }
    }
  }

  // 3) YYMMDD (6자리, 20xx년 가정)
  if (!date) {
    const re = /\b(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(base)) !== null) {
      // 앞뒤에 다른 숫자가 붙어있으면 더 긴 숫자의 일부 → 스킵
      const before = base[m.index - 1];
      const after  = base[m.index + m[0].length];
      if (before && /\d/.test(before)) continue;
      if (after  && /\d/.test(after))  continue;

      const yy = parseInt(m[1]);
      const y  = yy >= 0 && yy <= 50 ? 2000 + yy : 1900 + yy; // 00~50 → 20xx
      const mo = parseInt(m[2]);
      const d  = parseInt(m[3]);
      if (isValidDate(y, mo, d)) {
        date = toDateStr(y, mo, d);
        usedRanges.push([m.index, m.index + m[0].length]);
        break;
      }
    }
  }

  // 4) MMDD (4자리)
  if (!date) {
    const re = /\b(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(base)) !== null) {
      const before = base[m.index - 1];
      const after  = base[m.index + m[0].length];
      if (before && /\d/.test(before)) continue;
      if (after  && /\d/.test(after))  continue;

      const mo = parseInt(m[1]);
      const d  = parseInt(m[2]);
      if (isValidDate(thisYear, mo, d)) {
        date = toDateStr(thisYear, mo, d);
        usedRanges.push([m.index, m.index + m[0].length]);
        break;
      }
    }
  }

  // ── 금액 (날짜로 쓰인 범위 제외, 3~8자리) ────────────────────
  let amount: number | null = null;
  const amountRe = /\b(\d{3,8})\b/g;
  let am: RegExpExecArray | null;
  while ((am = amountRe.exec(base)) !== null) {
    const start = am.index;
    const end   = am.index + am[0].length;
    // 날짜로 이미 사용된 범위 제외
    if (usedRanges.some(([s, e]) => start < e && end > s)) continue;

    const num = parseInt(am[1], 10);
    // 전형적인 금액 범위: 100원 ~ 9,999,9999원
    if (num < 100 || num > 99999999) continue;

    amount = num;
    usedRanges.push([start, end]);
    break;
  }

  // ── 키워드 (한글 텍스트) ──────────────────────────────────────
  // 사용된 숫자 범위를 공백으로 대체하고 한글만 추출
  let remaining = base;
  const sorted = [...usedRanges].sort((a, b) => b[0] - a[0]);
  for (const [s, e] of sorted) {
    remaining = remaining.slice(0, s) + ' '.repeat(e - s) + remaining.slice(e);
  }
  const keyword = remaining.replace(/[^가-힣a-zA-Z\s]+/g, ' ').trim().replace(/\s+/g, ' ') || null;

  return { date, amount, keyword };
}

/**
 * OCR 텍스트에서 날짜, 금액, 키워드를 추출합니다.
 */
export function parseOcrText(text: string): {
  date: string | null;
  amount: number | null;
  keywords: string[];
} {
  const thisYear = new Date().getFullYear();
  let date: string | null = null;
  let amount: number | null = null;

  // 날짜 패턴
  const datePatterns: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/,
      (m) => `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`],
    [/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/,
      (m) => `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`],
    [/(\d{1,2})월\s*(\d{1,2})일/,
      (m) => `${thisYear}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`],
  ];
  for (const [pat, fmt] of datePatterns) {
    const m = text.match(pat);
    if (m) { date = fmt(m); break; }
  }

  // 금액 패턴 — 합계/총액 라벨 뒤 숫자 우선
  const amountPatterns = [
    /(?:합계|총액|결제금액|청구금액|받을금액|total)[^\d]*(\d[\d,]+)/i,
    /(\d[\d,]+)\s*원/,
  ];
  for (const pat of amountPatterns) {
    const m = text.match(pat);
    if (m) {
      amount = parseInt(m[1].replace(/,/g, ''), 10);
      break;
    }
  }

  // 한글 키워드 추출 — 의미 있는 단어(2글자 이상) 수집
  // 영수증 헤더/노이즈 단어 제외
  const noiseWords = new Set([
    '영수증', '간이영수증', '합계', '총액', '결제', '카드', '현금', '거래', '승인',
    '번호', '주소', '전화', '팩스', '사업자', '등록', '대표', '공급', '부가', '세액',
    '단가', '수량', '금액', '합산', '소계', '할인', '봉사료', '서비스', '날짜', '시간',
  ]);
  const koreanWords = (text.match(/[가-힣]{2,}/g) || [])
    .filter((w) => !noiseWords.has(w))
    .filter((w, i, arr) => arr.indexOf(w) === i); // 중복 제거

  return { date, amount, keywords: koreanWords };
}
