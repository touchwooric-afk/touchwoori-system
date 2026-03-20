/**
 * 이미지 압축 유틸리티
 * 업로드 전 클라이언트에서 실행
 */

export async function compressImage(file: File): Promise<File> {
  const imageCompression = (await import('browser-image-compression')).default;

  const options = {
    maxWidthOrHeight: 1200,
    maxSizeMB: 1,
    useWebWorker: true,
    fileType: 'image/jpeg' as const,
  };

  const compressed = await imageCompression(file, options);

  // File 객체로 변환 (이름에 .jpg 확장자 보장)
  const fileName = file.name.replace(/\.[^.]+$/, '.jpg');
  return new File([compressed], fileName, { type: 'image/jpeg' });
}

/**
 * Supabase Storage에 이미지 업로드
 */
export async function uploadReceiptImage(
  supabase: ReturnType<typeof import('@/lib/supabase').createClient>,
  file: File,
  departmentId: string,
  userId: string,
  receiptId: string
): Promise<string> {
  const timestamp = Date.now();
  const path = `receipts/${departmentId}/${userId}/${receiptId}_${timestamp}.jpg`;

  const { error } = await supabase.storage
    .from('receipts')
    .upload(path, file, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (error) throw new Error('이미지 업로드에 실패했습니다');

  const { data: urlData } = supabase.storage
    .from('receipts')
    .getPublicUrl(path);

  return urlData.publicUrl;
}

/**
 * Supabase Storage에서 이미지 삭제
 */
export async function deleteReceiptImage(
  supabase: ReturnType<typeof import('@/lib/supabase').createClient>,
  imageUrl: string
): Promise<void> {
  // URL에서 Storage path 추출
  const match = imageUrl.match(/\/receipts\/(.+)$/);
  if (!match) return;

  const path = match[1];
  await supabase.storage.from('receipts').remove([path]);
}
