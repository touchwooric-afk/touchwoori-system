export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { requireActive } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireActive();
    const { id } = await params;
    const body = await request.json() as { content?: string };
    const content = body.content?.trim() || '';
    if (!content || content.length > 1000) {
      return NextResponse.json({ error: '댓글은 1자 이상 1,000자 이하로 입력해주세요' }, { status: 400 });
    }
    const service = createServiceClient();
    const { data: post } = await service.from('board_posts').select('id').eq('id', id).maybeSingle();
    if (!post) return NextResponse.json({ error: '게시글을 찾을 수 없습니다' }, { status: 404 });
    const { data, error } = await service.from('board_comments')
      .insert({ post_id: id, author_id: user.id, content })
      .select('*, author:users!author_id(id, name, department_id, position)')
      .single();
    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '댓글을 등록할 수 없습니다' }, { status: 500 });
  }
}
