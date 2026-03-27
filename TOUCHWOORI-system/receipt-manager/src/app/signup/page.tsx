'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import type { Position } from '@/types';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [department, setDepartment] = useState('');
  const [positions, setPositions] = useState<Position[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const fetchPositions = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('positions')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      if (data) setPositions(data);
    };
    fetchPositions();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // 유효성 검증
    if (password.length < 8) {
      setError('비밀번호는 최소 8자 이상이어야 합니다');
      return;
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('비밀번호는 영문과 숫자를 모두 포함해야 합니다');
      return;
    }
    if (password !== passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다');
      return;
    }
    if (!name.trim()) {
      setError('이름을 입력해주세요');
      return;
    }
    if (!position) {
      setError('직분을 선택해주세요');
      return;
    }
    if (!department) {
      setError('부서를 선택해주세요');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      // 1. Supabase Auth에 사용자 생성
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
          setError('이미 등록된 이메일입니다');
        } else if (authError.message.includes('Password should be')) {
          setError(`비밀번호 조건 미충족: ${authError.message}`);
        } else {
          setError(`계정 생성 실패: ${authError.message}`);
        }
        return;
      }

      if (!authData.user) {
        setError('계정 생성에 실패했습니다');
        return;
      }

      // 2. API를 통해 프로필 생성 (service client로 RLS 우회)
      const profileRes = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: authData.user.id,
          email,
          name: name.trim(),
          department_id: department,
          position,
        }),
      });

      if (!profileRes.ok) {
        const profileJson = await profileRes.json();
        setError(profileJson.error || '프로필 생성에 실패했습니다');
        return;
      }

      // 성공 화면 표시
      setSuccess(true);
    } catch (err) {
      setError(`오류: ${err instanceof Error ? err.message : '잠시 후 다시 시도해주세요'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-info-50 px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary-600 to-primary-500 bg-clip-text text-transparent">
            TOUCHWOORI
          </h1>
          <p className="mt-2 text-sm text-gray-500">계정 신청</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          {success ? (
            <div className="text-center py-6 space-y-4">
              <div className="mx-auto w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">계정 신청이 완료되었습니다</h2>
              <p className="text-sm text-gray-500">
                관리자가 승인하면 서비스를 이용하실 수 있습니다.<br />
                승인까지 잠시 기다려주세요.
              </p>
              <Button onClick={() => router.push('/login')} className="w-full mt-2">
                로그인 페이지로 이동
              </Button>
            </div>
          ) : (
          <>
          <h2 className="text-lg font-semibold text-gray-900 mb-6">계정 신청</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                이메일 <span className="text-danger-600">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={254}
                placeholder="이메일을 입력하세요"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                  focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                  outline-none transition-shadow"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                비밀번호 <span className="text-danger-600">*</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="영문 + 숫자 포함 8자 이상"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                  focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                  outline-none transition-shadow"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                비밀번호 확인 <span className="text-danger-600">*</span>
              </label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                placeholder="비밀번호를 다시 입력하세요"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                  focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                  outline-none transition-shadow"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                이름 <span className="text-danger-600">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={50}
                placeholder="실명을 입력하세요"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                  focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                  outline-none transition-shadow"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                부서 <span className="text-danger-600">*</span>
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                  focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                  outline-none transition-shadow"
              >
                <option value="">부서를 선택하세요</option>
                <option value="고등부">터치우리 고등부</option>
                <option value="중등부">드림우리 중등부</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                직분 <span className="text-danger-600">*</span>
              </label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                  focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                  outline-none transition-shadow"
              >
                <option value="">직분을 선택하세요</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <p className="text-sm text-danger-600">{error}</p>
            )}

            <Button type="submit" loading={loading} className="w-full">
              계정 신청
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Link
              href="/login"
              className="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
            >
              이미 계정이 있으신가요? 로그인
            </Link>
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
