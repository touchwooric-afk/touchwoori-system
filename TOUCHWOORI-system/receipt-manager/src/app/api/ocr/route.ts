import { NextResponse } from 'next/server';

// POST: OCR 처리 (플레이스홀더 - 실제 OCR은 클라이언트에서 Tesseract.js로 처리)
export async function POST() {
  return NextResponse.json({
    data: {
      message: 'OCR 처리는 클라이언트에서 수행됩니다. 이 엔드포인트는 향후 서버사이드 OCR을 위한 플레이스홀더입니다.',
    },
  });
}
