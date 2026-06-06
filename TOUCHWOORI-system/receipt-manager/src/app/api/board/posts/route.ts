export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { requireActive } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  try {
    const user = await requireActive();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get('pageSize')) || 15));
    const mine = searchParams.get('mine') === 'true';
    const recent = searchParams.get('recent') === 'true';
    const search = searchParams.get('search')?.trim().slice(0, 100) || '';
    const service = createServiceClient();

    let query = service
      .from('board_posts')
      .select('*, author:users!author_id(id, name, department_id, position), comments:board_comments(count)', {
        count: 'exact',
      })
      .order('created_at', { ascending: false });

    if (mine) query = query.eq('author_id', user.id);
    if (search) query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
    query = recent ? query.limit(5) : query.range((page - 1) * pageSize, page * pageSize - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    const posts = (data || []).map(({ comments, ...post }) => ({
      ...post,
      comment_count: comments?.[0]?.count || 0,
    }));
    return NextResponse.json({ data: posts, total: count || 0, page, pageSize });
  } catch (error) {
    const message = error instanceof Error ? error.message : '게시글을 불러올 수 없습니다';
    const status = message.includes('인증') ? 401 : message.includes('승인') || message.includes('역할') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireActive();
    const body = await request.json() as { title?: string; content?: string };
    const title = body.title?.trim() || '';
    const content = body.content?.trim() || '';
    if (!title || title.length > 120) {
      return NextResponse.json({ error: '제목은 1자 이상 120자 이하로 입력해주세요' }, { status: 400 });
    }
    if (!content || content.length > 10000) {
      return NextResponse.json({ error: '내용은 1자 이상 10,000자 이하로 입력해주세요' }, { status: 400 });
    }

    const { data, error } = await createServiceClient()
      .from('board_posts')
      .insert({ author_id: user.id, title, content })
      .select('id')
      .single();
    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '게시글을 등록할 수 없습니다';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
