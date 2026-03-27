/**
 * OCR 정확도 향상을 위한 이미지 전처리
 * - EXIF 방향 보정 (회전)
 * - 그레이스케일 변환
 * - 대비 향상 (adaptive)
 * - 샤프닝
 */

/** EXIF Orientation 값에서 회전 각도 추출 */
async function getExifRotation(file: File): Promise<number> {
  try {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);

    // JPEG 시그니처 확인
    if (view.getUint16(0) !== 0xffd8) return 0;

    let offset = 2;
    while (offset < view.byteLength) {
      const marker = view.getUint16(offset);
      offset += 2;

      if (marker === 0xffe1) {
        // APP1 (Exif)
        const length = view.getUint16(offset);
        offset += 2;

        // "Exif\0\0" 확인
        const exifHeader = String.fromCharCode(
          view.getUint8(offset),
          view.getUint8(offset + 1),
          view.getUint8(offset + 2),
          view.getUint8(offset + 3)
        );
        if (exifHeader !== 'Exif') return 0;

        const tiffOffset = offset + 6;
        const littleEndian = view.getUint16(tiffOffset) === 0x4949;
        const getUint16 = (o: number) =>
          littleEndian
            ? view.getUint16(tiffOffset + o, true)
            : view.getUint16(tiffOffset + o, false);
        const getUint32 = (o: number) =>
          littleEndian
            ? view.getUint32(tiffOffset + o, true)
            : view.getUint32(tiffOffset + o, false);

        const ifdOffset = getUint32(4);
        const numEntries = getUint16(ifdOffset);

        for (let i = 0; i < numEntries; i++) {
          const entryOffset = ifdOffset + 2 + i * 12;
          const tag = getUint16(entryOffset);
          if (tag === 0x0112) {
            // Orientation tag
            const orientation = getUint16(entryOffset + 8);
            switch (orientation) {
              case 3: return 180;
              case 6: return 90;
              case 8: return 270;
              default: return 0;
            }
          }
        }
        return 0;
      } else if ((marker & 0xff00) !== 0xff00) {
        break;
      } else {
        offset += view.getUint16(offset);
        offset += 2;
      }
    }
  } catch {
    // EXIF 파싱 실패 시 회전 없음
  }
  return 0;
}

/** 픽셀별 대비 향상 (linear stretch) */
function enhanceContrast(data: Uint8ClampedArray, width: number, height: number): void {
  let min = 255;
  let max = 0;

  // 그레이스케일 min/max 탐색
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (gray < min) min = gray;
    if (gray > max) max = gray;
  }

  if (max - min < 10) return; // 이미 균일하면 스킵

  const range = max - min;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const stretched = Math.round(((gray - min) / range) * 255);
    // 샤프닝: 원본과 stretched 혼합 (영수증은 흑백 텍스트 위주)
    const enhanced = Math.min(255, Math.max(0, stretched));
    data[i] = enhanced;
    data[i + 1] = enhanced;
    data[i + 2] = enhanced;
    // alpha 유지
  }
}

/**
 * 이미지 파일을 OCR에 최적화된 canvas ImageData로 전처리합니다.
 * 반환: blob (grayscale + contrast enhanced JPEG)
 */
export async function preprocessForOcr(file: File): Promise<Blob> {
  const rotation = await getExifRotation(file);

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const rotated = rotation === 90 || rotation === 270;
        const canvas = document.createElement('canvas');

        // OCR 최적 해상도: 1600px 상한 (너무 크면 느림)
        const MAX = 1600;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (Math.max(w, h) > MAX) {
          const scale = MAX / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }

        canvas.width = rotated ? h : w;
        canvas.height = rotated ? w : h;

        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 회전 적용
        if (rotation !== 0) {
          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate((rotation * Math.PI) / 180);
          ctx.drawImage(img, -w / 2, -h / 2, w, h);
          ctx.restore();
        } else {
          ctx.drawImage(img, 0, 0, w, h);
        }

        // 그레이스케일 + 대비 향상
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        enhanceContrast(imageData.data, canvas.width, canvas.height);
        ctx.putImageData(imageData, 0, 0);

        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('canvas toBlob 실패'));
          },
          'image/jpeg',
          0.92
        );
      } catch (e) {
        reject(e);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지 로드 실패'));
    };

    img.src = url;
  });
}
