'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageCircle, Search } from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import type { BoardPost } from '@/types';

function displayDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value));
}

export default function PostList({ mine = false }: { mine?: boolean }) {
  const toast = useToast();
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const pageSize = 15;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (mine) params.set('mine', 'true');
      if (search) params.set('search', search);
      const res = await fetch(`/api/board/posts?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setPosts(json.data);
      setTotal(json.total);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '게시글을 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, [mine, page, search, toast]);

  useEffect(() => { load(); }, [load]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  if (loading) return <PageSkeleton />;

  return (
    <section className="glass-panel overflow-hidden rounded-2xl">
      <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-bold text-gray-900">{mine ? '내가 쓴 글' : '전체 게시글'}</h2>
          <p className="mt-0.5 text-xs text-gray-500">총 {total.toLocaleString()}개</p>
        </div>
        <form onSubmit={submitSearch} className="flex w-full sm:w-auto">
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="제목 또는 내용 검색"
            className="min-w-0 flex-1 rounded-l-xl border border-r-0 border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400 sm:w-64"
          />
          <button className="rounded-r-xl bg-primary-600 px-3 text-white" aria-label="검색">
            <Search className="h-4 w-4" />
          </button>
        </form>
      </div>

      {posts.length === 0 ? (
        <div className="px-4 py-16 text-center">
          <MessageCircle className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 font-semibold text-gray-700">{mine ? '아직 작성한 글이 없습니다' : '등록된 게시글이 없습니다'}</p>
          <Link href="/board/new" className="mt-3 inline-block text-sm font-semibold text-primary-600">첫 글 작성하기</Link>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {posts.map((post) => (
            <Link key={post.id} href={`/board/${post.id}`} className="block px-4 py-4 transition-colors hover:bg-primary-50/50 sm:px-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold text-gray-900">{post.title}</h3>
                    {(post.comment_count || 0) > 0 && (
                      <span className="shrink-0 text-xs font-semibold text-primary-600">[{post.comment_count}]</span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm text-gray-500">{post.content}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-gray-400">
                    <span>{post.author?.name || '알 수 없음'}</span>
                    <span>·</span>
                    <span>{post.author?.department_id}</span>
                  </div>
                </div>
                <time className="shrink-0 text-xs text-gray-400">{displayDate(post.created_at)}</time>
              </div>
            </Link>
          ))}
        </div>
      )}
      <div className="px-4 pb-5">
        <Pagination totalItems={total} pageSize={pageSize} currentPage={page} onPageChange={setPage} />
      </div>
    </section>
  );
}
