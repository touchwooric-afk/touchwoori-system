'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import Button from '@/components/ui/Button';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError('이메일 또는 비밀번호가 올바르지 않습니다');
        return;
      }

      // 사용자 상태 확인
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('로그인에 실패했습니다');
        return;
      }

      const { data: profile } = await supabase
        .from('users')
        .select('status')
        .eq('id', user.id)
        .single();

      if (profile?.status === 'pending') {
        router.push('/pending');
      } else if (profile?.status === 'inactive') {
        setError('비활성화된 계정입니다. 관리자에게 문의해주세요.');
        await supabase.auth.signOut();
      } else {
        router.push('/');
      }
    } catch {
      setError('일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-info-50 px-4">
      <div className="w-full max-w-sm">
        {/* 로고 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary-600 to-primary-500 bg-clip-text text-transparent">
            TOUCHWOORI
          </h1>
          <p className="mt-2 text-sm text-gray-500">고등부 영수증 관리 시스템</p>
        </div>

        {/* 로그인 카드 */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">로그인</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                이메일
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="이메일을 입력하세요"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                  focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                  outline-none transition-shadow"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                비밀번호
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="비밀번호를 입력하세요"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                  focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                  outline-none transition-shadow"
              />
            </div>

            {error && (
              <p className="text-sm text-danger-600">{error}</p>
            )}

            <Button type="submit" loading={loading} className="w-full">
              로그인
            </Button>
          </form>

          <div className="mt-4 flex items-center justify-between text-sm">
            <Link
              href="/signup"
              className="text-primary-600 hover:text-primary-700 font-medium transition-colors"
            >
              계정 신청
            </Link>
            <Link
              href="/reset-password"
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              비밀번호 재설정
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
