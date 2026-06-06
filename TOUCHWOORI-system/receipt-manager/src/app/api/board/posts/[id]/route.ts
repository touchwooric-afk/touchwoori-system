export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { requireActive } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireActive();
    const { id } = await params;
    const service = createServiceClient();
    const [{ data: post, error }, { data: comments, error: commentsError }] = await Promise.all([
      service.from('board_posts')
        .select('*, author:users!author_id(id, name, department_id, position)')
        .eq('id', id).maybeSingle(),
      service.from('board_comments')
        .select('*, author:users!author_id(id, name, department_id, position)')
        .eq('post_id', id).order('created_at', { ascending: true }),
    ]);
    if (error || !post) return NextResponse.json({ error: '게시글을 찾을 수 없습니다' }, { status: 404 });
    if (commentsError) throw commentsError;
    return NextResponse.json({ data: { ...post, comments: comments || [] } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '게시글을 불러올 수 없습니다' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireActive();
    const { id } = await params;
    const body = await request.json() as { title?: string; content?: string };
    const title = body.title?.trim() || '';
    const content = body.content?.trim() || '';
    if (!title || title.length > 120 || !content || content.length > 10000) {
      return NextResponse.json({ error: '제목과 내용을 입력 범위에 맞게 작성해주세요' }, { status: 400 });
    }
    const service = createServiceClient();
    const { data: post } = await service.from('board_posts').select('author_id').eq('id', id).maybeSingle();
    if (!post) return NextResponse.json({ error: '게시글을 찾을 수 없습니다' }, { status: 404 });
    if (post.author_id !== user.id) {
      return NextResponse.json({ error: '본인이 작성한 글만 수정할 수 있습니다' }, { status: 403 });
    }
    const { error } = await service.from('board_posts').update({ title, content }).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ data: { id } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '게시글을 수정할 수 없습니다' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireActive();
    const { id } = await params;
    const service = createServiceClient();
    const { data: post } = await service.from('board_posts').select('author_id').eq('id', id).maybeSingle();
    if (!post) return NextResponse.json({ error: '게시글을 찾을 수 없습니다' }, { status: 404 });
    if (post.author_id !== user.id && user.role !== 'master') {
      return NextResponse.json({ error: '게시글 삭제 권한이 없습니다' }, { status: 403 });
    }
    const { error } = await service.from('board_posts').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ data: { id } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '게시글을 삭제할 수 없습니다' }, { status: 500 });
  }
}
