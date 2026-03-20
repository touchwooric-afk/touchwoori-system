/**
 * 금액을 원화 형식으로 포맷 (₩48,000)
 */
export function formatCurrency(amount: number): string {
  return `₩${amount.toLocaleString('ko-KR')}`;
}

/**
 * 날짜를 한국어 형식으로 표시 (2026년 03월 15일)
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}년 ${month}월 ${day}일`;
}

/**
 * 날짜를 짧은 형식으로 표시 (2026-03-15)
 */
export function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 날짜를 ISO 형식 (YYYY-MM-DD)으로 변환 (DB 저장용)
 */
export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 오늘 날짜를 ISO 형식으로 반환
 */
export function today(): string {
  return toISODate(new Date());
}

/**
 * 어제 날짜를 ISO 형식으로 반환
 */
export function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toISODate(d);
}

/**
 * 숫자에 콤마를 추가 (1234567 -> "1,234,567")
 */
export function addCommas(num: number | string): string {
  return Number(num).toLocaleString('ko-KR');
}

/**
 * 콤마가 포함된 문자열에서 숫자만 추출
 */
export function removeCommas(str: string): number {
  return Number(str.replace(/[^0-9]/g, '')) || 0;
}

/**
 * 역할 한국어 표시
 */
export function formatRole(role: string | null): string {
  switch (role) {
    case 'master': return '마스터';
    case 'accountant': return '회계 교사';
    case 'teacher': return '교사';
    default: return '미지정';
  }
}

/**
 * 상태 한국어 표시
 */
export function formatStatus(status: string): string {
  switch (status) {
    case 'pending': return '대기중';
    case 'active': return '활성';
    case 'inactive': return '비활성';
    case 'approved': return '승인됨';
    case 'rejected': return '반려됨';
    default: return status;
  }
}
