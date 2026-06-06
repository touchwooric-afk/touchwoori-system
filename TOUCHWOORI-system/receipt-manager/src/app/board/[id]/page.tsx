'use client';

export const runtime = 'edge';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MessageCircle, Pencil, Trash2 } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import BoardHeader from '@/components/board/BoardHeader';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useUser } from '@/hooks/useUser';
import type { BoardComment, BoardPost } from '@/types';

interface PostDetail extends BoardPost {
  comments: BoardComment[];
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

export default function BoardPostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { user } = useUser();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'post' | 'comment'; id: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/board/posts/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setPost(json.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '게시글을 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => { load(); }, [load]);

  const addComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!comment.trim()) return;
    setSavingComment(true);
    try {
      const res = await fetch(`/api/board/posts/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: comment }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setPost((current) => current ? { ...current, comments: [...current.comments, json.data] } : current);
      setComment('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '댓글을 등록할 수 없습니다');
    } finally {
      setSavingComment(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const url = deleteTarget.type === 'post'
        ? `/api/board/posts/${deleteTarget.id}`
        : `/api/board/comments/${deleteTarget.id}`;
      const res = await fetch(url, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (deleteTarget.type === 'post') {
        toast.success('게시글을 삭제했습니다');
        router.push('/board');
      } else {
        setPost((current) => current ? {
          ...current,
          comments: current.comments.filter((item) => item.id !== deleteTarget.id),
        } : current);
        toast.success('댓글을 삭제했습니다');
      }
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '삭제할 수 없습니다');
    } finally {
      setDeleting(false);
    }
  };

  const canManagePost = !!post && (post.author_id === user?.id || user?.role === 'master');
  const canEditPost = !!post && post.author_id === user?.id;

  return (
    <AppShell>
      <div className="space-y-5">
        <BoardHeader />
        {loading ? <PageSkeleton /> : !post ? (
          <div className="glass-panel rounded-2xl p-12 text-center text-gray-500">게시글을 찾을 수 없습니다.</div>
        ) : (
          <>
            <article className="glass-panel overflow-hidden rounded-2xl">
              <header className="border-b border-gray-100 p-5 sm:p-6">
                <h2 className="break-words text-xl font-bold text-gray-900 sm:text-2xl">{post.title}</h2>
                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                  <span className="font-semibold text-gray-700">{post.author?.name}</span>
                  <span>·</span><span>{post.author?.department_id}</span>
                  <span>·</span><time>{dateTime(post.created_at)}</time>
                  {post.updated_at !== post.created_at && <span>(수정됨)</span>}
                </div>
              </header>
              <div className="min-h-52 whitespace-pre-wrap break-words p-5 text-[15px] leading-8 text-gray-800 sm:p-6">
                {post.content}
              </div>
              <footer className="flex flex-wrap justify-between gap-2 border-t border-gray-100 p-4 sm:px-6">
                <Link href="/board"><Button variant="secondary">목록으로</Button></Link>
                {canManagePost && (
                  <div className="flex gap-2">
                    {canEditPost && <Link href={`/board/${post.id}/edit`}><Button variant="secondary"><Pencil className="h-4 w-4" />수정</Button></Link>}
                    <Button variant="danger" onClick={() => setDeleteTarget({ type: 'post', id: post.id })}>
                      <Trash2 className="h-4 w-4" />삭제
                    </Button>
                  </div>
                )}
              </footer>
            </article>

            <section className="glass-panel rounded-2xl p-4 sm:p-6">
              <h3 className="flex items-center gap-2 font-bold text-gray-900">
                <MessageCircle className="h-5 w-5 text-primary-600" />댓글 {post.comments.length}
              </h3>
              <form onSubmit={addComment} className="mt-4 flex flex-col gap-2 sm:flex-row">
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  maxLength={1000}
                  rows={2}
                  placeholder="댓글을 입력하세요"
                  className="min-w-0 flex-1 resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
                <Button type="submit" loading={savingComment} disabled={!comment.trim()} className="sm:self-stretch">댓글 등록</Button>
              </form>
              <div className="mt-5 divide-y divide-gray-100">
                {post.comments.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">첫 댓글을 남겨보세요.</p>
                ) : post.comments.map((item) => {
                  const canDelete = item.author_id === user?.id || user?.role === 'master';
                  return (
                    <div key={item.id} className="py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-semibold text-gray-800">{item.author?.name}</span>
                            <span className="text-gray-400">{item.author?.department_id}</span>
                            <time className="text-gray-400">{dateTime(item.created_at)}</time>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-700">{item.content}</p>
                        </div>
                        {canDelete && (
                          <button onClick={() => setDeleteTarget({ type: 'comment', id: item.id })} className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="댓글 삭제">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={deleteTarget?.type === 'post' ? '게시글 삭제' : '댓글 삭제'}
        message="삭제한 내용은 복구할 수 없습니다. 삭제하시겠습니까?"
        confirmText="삭제"
        loading={deleting}
        onConfirm={remove}
        onCancel={() => setDeleteTarget(null)}
      />
    </AppShell>
  );
}
