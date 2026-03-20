/**
 * PDF 생성 유틸리티
 * @react-pdf/renderer를 사용한 서버/클라이언트 PDF 생성
 */

export interface PdfItem {
  date: string;
  description: string;
  expense: number;
  categoryName: string;
  imageUrl: string | null;
}

export interface PdfData {
  title: string;
  period: string;
  departmentName: string;
  summary: { category: string; total: number }[];
  totalExpense: number;
  items: PdfItem[];
}

/**
 * PDF 파일명을 생성합니다
 */
export function generatePdfFilename(departmentName: string, title: string): string {
  const cleanTitle = title.replace(/\s+/g, '');
  return `${departmentName}_${cleanTitle}.pdf`;
}
