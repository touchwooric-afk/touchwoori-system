'use client';

export const runtime = 'edge';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import BoardHeader from '@/components/board/BoardHeader';
import PostForm from '@/components/board/PostForm';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useUser } from '@/hooks/useUser';
import type { BoardPost } from '@/types';

export default function EditBoardPostPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { user } = useUser();
  const [post, setPost] = useState<BoardPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/board/posts/${id}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        if (user && json.data.author_id !== user.id) {
          toast.error('본인이 작성한 글만 수정할 수 있습니다');
          router.replace(`/board/${id}`);
          return;
        }
        setPost(json.data);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '게시글을 불러올 수 없습니다');
      } finally {
        setLoading(false);
      }
    };
    if (user) load();
  }, [id, router, toast, user]);

  return (
    <AppShell>
      <div className="space-y-5">
        <BoardHeader />
        {loading ? <PageSkeleton /> : post ? (
          <PostForm postId={post.id} initialTitle={post.title} initialContent={post.content} />
        ) : null}
      </div>
    </AppShell>
  );
}
