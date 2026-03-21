import { createServerClient, createServiceClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

type Params = { params: Promise<{ id: string }> };

async function authorizeEditor(supabase: Awaited<ReturnType<typeof createServerClient>>) {
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return { error: '인증이 필요합니다', status: 401, profile: null };

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single();

  if (!profile || profile.status !== 'active') {
    return { error: '접근 권한이 없습니다', status: 403, profile: null };
  }
  if (profile.role !== 'master' && profile.role !== 'accountant') {
    return { error: '회계 담당자 이상 권한이 필요합니다', status: 403, profile: null };
  }
  return { error: null, status: 200, profile, authUser };
}

// POST: 감사 파일 업로드
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const supabase = await createServerClient();
    const auth = await authorizeEditor(supabase);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: '파일 크기는 20MB 이하여야 합니다' }, { status: 400 });
    }

    const ext = file.name.split('.').pop() || 'pdf';
    const path = `audit-files/${id}/${Date.now()}.${ext}`;
    const bytes = await file.arrayBuffer();

    const serviceClient = createServiceClient();

    // 기존 파일 삭제 (있으면)
    const { data: existing } = await serviceClient
      .from('settlements')
      .select('audit_file_url')
      .eq('id', id)
      .single();

    if (existing?.audit_file_url) {
      try {
        const url = new URL(existing.audit_file_url);
        const m = url.pathname.match(/\/storage\/v1\/object\/public\/receipts\/(.+)/);
        if (m) await serviceClient.storage.from('receipts').remove([m[1]]);
      } catch { /* 무시 */ }
    }

    const { error: uploadError } = await serviceClient.storage
      .from('receipts')
      .upload(path, bytes, { contentType: file.type, upsert: true });

    if (uploadError) {
      return NextResponse.json({ error: `파일 업로드 실패: ${uploadError.message}` }, { status: 500 });
    }

    const { data: urlData } = serviceClient.storage.from('receipts').getPublicUrl(path);
    const audit_file_url = urlData.publicUrl;

    const { data, error } = await serviceClient
      .from('settlements')
      .update({ audit_file_url })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: `저장 실패: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: `서버 오류: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}

// PATCH: 감사 메모 수정
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const supabase = await createServerClient();
    const auth = await authorizeEditor(supabase);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;
    const { audit_note } = await request.json();

    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient
      .from('settlements')
      .update({ audit_note: audit_note ?? null })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: `수정 실패: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: `서버 오류: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}

// DELETE: 감사 파일 삭제
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const supabase = await createServerClient();
    const auth = await authorizeEditor(supabase);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;
    const serviceClient = createServiceClient();

    const { data: existing } = await serviceClient
      .from('settlements')
      .select('audit_file_url')
      .eq('id', id)
      .single();

    if (existing?.audit_file_url) {
      try {
        const url = new URL(existing.audit_file_url);
        const m = url.pathname.match(/\/storage\/v1\/object\/public\/receipts\/(.+)/);
        if (m) await serviceClient.storage.from('receipts').remove([m[1]]);
      } catch { /* 무시 */ }
    }

    const { data, error } = await serviceClient
      .from('settlements')
      .update({ audit_file_url: null })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: `삭제 실패: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: `서버 오류: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}
