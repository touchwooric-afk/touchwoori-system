export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { requireActive } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireActive();
    const { id } = await params;
    const service = createServiceClient();
    const { data: comment } = await service.from('board_comments').select('author_id').eq('id', id).maybeSingle();
    if (!comment) return NextResponse.json({ error: '댓글을 찾을 수 없습니다' }, { status: 404 });
    if (comment.author_id !== user.id && user.role !== 'master') {
      return NextResponse.json({ error: '댓글 삭제 권한이 없습니다' }, { status: 403 });
    }
    const { error } = await service.from('board_comments').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ data: { id } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '댓글을 삭제할 수 없습니다' }, { status: 500 });
  }
}
