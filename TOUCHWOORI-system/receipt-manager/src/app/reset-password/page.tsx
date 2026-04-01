'use client';

export const runtime = 'edge';


import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import Button from '@/components/ui/Button';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) {
        setError('비밀번호 재설정 이메일 전송에 실패했습니다');
        return;
      }

      setSent(true);
    } catch {
      setError('일시적인 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-info-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary-600 to-primary-500 bg-clip-text text-transparent">
            TOUCHWOORI
          </h1>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">비밀번호 재설정</h2>

          {sent ? (
            <div className="text-center py-4">
              <p className="text-sm text-gray-600">
                <strong>{email}</strong>로 비밀번호 재설정 링크를 보냈습니다.
              </p>
              <p className="mt-2 text-sm text-gray-500">
                이메일을 확인해주세요.
              </p>
              <Link
                href="/login"
                className="mt-4 inline-block text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                로그인으로 돌아가기
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-6">
                등록된 이메일을 입력하면 비밀번호 재설정 링크를 보내드립니다.
              </p>
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
                    placeholder="등록된 이메일을 입력하세요"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                      focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                      outline-none transition-shadow"
                  />
                </div>

                {error && <p className="text-sm text-danger-600">{error}</p>}

                <Button type="submit" loading={loading} className="w-full">
                  재설정 링크 전송
                </Button>
              </form>

              <div className="mt-4 text-center">
                <Link
                  href="/login"
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  로그인으로 돌아가기
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
