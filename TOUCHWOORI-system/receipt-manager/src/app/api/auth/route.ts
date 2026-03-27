import { createServerClient, createServiceClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

// POST: 회원가입 시 프로필 생성 (RLS 우회)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, email, name, department_id, position } = body;

    if (!id || !email || !name || !department_id || !position) {
      return NextResponse.json({ error: '필수 정보가 누락되었습니다' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 중복 방지: 이미 존재하는지 확인
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('id', id)
      .single();

    if (existing) {
      return NextResponse.json({ error: '이미 등록된 사용자입니다' }, { status: 409 });
    }

    const { error } = await supabase
      .from('users')
      .insert({
        id,
        email,
        name: name.trim(),
        department_id,
        position,
        status: 'pending',
      });

    if (error) {
      return NextResponse.json({ error: `프로필 생성 실패: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ data: { message: '계정 신청이 완료되었습니다' } }, { status: 201 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}

// GET: 현재 사용자 프로필 조회
export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const { data: profile, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (error || !profile) {
      return NextResponse.json({ error: '사용자 정보를 찾을 수 없습니다' }, { status: 404 });
    }

    return NextResponse.json({ data: profile });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${detail}` }, { status: 500 });
  }
}
