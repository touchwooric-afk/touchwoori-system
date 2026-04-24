export const runtime = 'edge';

import { createServerClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

// GET: 내 즐겨찾기 목록 (RLS로 본인 데이터만 반환 — master도 타인 데이터 접근 불가)
export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

    const { data, error } = await supabase
      .from('account_favorites')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data || [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST: 즐겨찾기 추가
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

    const { label, bank_name, account_holder, account_number } = await request.json();
    if (!label || !bank_name || !account_holder || !account_number) {
      return NextResponse.json({ error: '모든 항목을 입력해주세요' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('account_favorites')
      .insert({ user_id: authUser.id, label, bank_name, account_holder, account_number })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE: 즐겨찾기 삭제 (?id=xxx)
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id가 필요합니다' }, { status: 400 });

    const { error } = await supabase
      .from('account_favorites')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: { message: '삭제되었습니다' } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
