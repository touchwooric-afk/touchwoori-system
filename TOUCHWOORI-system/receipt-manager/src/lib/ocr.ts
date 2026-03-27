import type { OcrResult } from '@/types';
import { preprocessForOcr } from './imagePreprocess';

/**
 * Tesseract.js로 이미지 파일을 OCR 처리합니다.
 * 전처리(회전보정, 대비향상) 후 한국어+영어 인식.
 */
export async function runOcr(file: File): Promise<OcrResult> {
  const { createWorker } = await import('tesseract.js');

  // 이미지 전처리
  let ocrSource: Blob | File = file;
  try {
    ocrSource = await preprocessForOcr(file);
  } catch {
    // 전처리 실패 시 원본 사용
  }

  const worker = await createWorker('kor+eng', 1, {
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/worker.min.js',
    langPath: 'https://tessdata.projectnaptha.com/4.0.0',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@6/tesseract-core.wasm.js',
    logger: () => {}, // 로그 억제
  });

  try {
    const { data } = await worker.recognize(ocrSource);
    return parseOcrResult(data.text);
  } finally {
    await worker.terminate();
  }
}

/**
 * OCR 텍스트에서 날짜를 추출합니다.
 * 지원 형식: YYYY.MM.DD, YYYY-MM-DD, YYYY/MM/DD, YYYY년 MM월 DD일
 */
export function extractDate(text: string): string | null {
  const patterns = [
    /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/,
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const year = match[1];
      const month = match[2].padStart(2, '0');
      const day = match[3].padStart(2, '0');
      const date = `${year}-${month}-${day}`;
      // 유효한 날짜인지 확인
      const d = new Date(date);
      if (!isNaN(d.getTime())) return date;
    }
  }
  return null;
}

/**
 * OCR 텍스트에서 금액을 추출합니다.
 * 가장 큰 금액을 반환합니다 (총액일 가능성이 높음).
 */
export function extractAmount(text: string): number | null {
  const patterns = [
    /합\s*계[:\s]*[\₩W]?\s*([\d,]+)/,
    /총[액계합][:\s]*[\₩W]?\s*([\d,]+)/,
    /결제[금액]*[:\s]*[\₩W]?\s*([\d,]+)/,
    /[\₩W]\s*([\d,]+)/g,
    /([\d,]{4,})\s*원/g,
  ];

  let maxAmount = 0;

  // 먼저 합계/총액/결제 패턴 시도
  for (let i = 0; i < 3; i++) {
    const match = text.match(patterns[i]);
    if (match) {
      const amount = Number(match[1].replace(/,/g, ''));
      if (amount > 0 && amount <= 99999999) return amount;
    }
  }

  // 금액 패턴에서 가장 큰 값 찾기
  const amountPattern = /[\d,]{3,}/g;
  let match;
  while ((match = amountPattern.exec(text)) !== null) {
    const amount = Number(match[0].replace(/,/g, ''));
    if (amount > 100 && amount <= 99999999 && amount > maxAmount) {
      maxAmount = amount;
    }
  }

  return maxAmount > 0 ? maxAmount : null;
}

/**
 * OCR 텍스트에서 가게명을 추출합니다.
 */
export function extractVendor(text: string): string | null {
  const lines = text.split('\n').filter((l) => l.trim());
  // 첫 번째 줄이 가게 이름인 경우가 많음
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    if (firstLine.length >= 2 && firstLine.length <= 30) {
      return firstLine;
    }
  }
  return null;
}

/**
 * OCR 결과를 파싱합니다.
 */
export function parseOcrResult(rawText: string): OcrResult {
  return {
    date: extractDate(rawText),
    amount: extractAmount(rawText),
    vendor: extractVendor(rawText),
    rawText,
  };
}
