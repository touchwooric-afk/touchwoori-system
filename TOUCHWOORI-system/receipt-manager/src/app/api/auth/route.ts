import { createServerClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

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
