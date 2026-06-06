'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

interface PostFormProps {
  postId?: string;
  initialTitle?: string;
  initialContent?: string;
}

export default function PostForm({ postId, initialTitle = '', initialContent = '' }: PostFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast.error('제목과 내용을 모두 입력해주세요');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(postId ? `/api/board/posts/${postId}` : '/api/board/posts', {
        method: postId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(postId ? '게시글을 수정했습니다' : '게시글을 등록했습니다');
      router.push(`/board/${postId || json.data.id}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '게시글을 저장할 수 없습니다');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="glass-panel rounded-2xl p-4 sm:p-6">
      <label className="block">
        <span className="text-sm font-semibold text-gray-700">제목</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          placeholder="함께 나눌 소식의 제목을 입력하세요"
          className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base font-medium text-gray-900 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
        />
        <span className="mt-1 block text-right text-xs text-gray-400">{title.length}/120</span>
      </label>
      <label className="mt-4 block">
        <span className="text-sm font-semibold text-gray-700">내용</span>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={10000}
          rows={14}
          placeholder="내용을 입력하세요"
          className="mt-2 w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm leading-7 text-gray-800 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
        />
        <span className="mt-1 block text-right text-xs text-gray-400">{content.length.toLocaleString()}/10,000</span>
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => router.back()}>취소</Button>
        <Button type="submit" loading={saving}>{postId ? '수정 완료' : '게시글 등록'}</Button>
      </div>
    </form>
  );
}
