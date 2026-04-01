'use client';

export const runtime = 'edge';


import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { useUser } from '@/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatDate, formatRole } from '@/lib/format';
import {
  User as UserIcon,
  Lock,
  FileText,
  ChevronRight,
} from 'lucide-react';
import type { Receipt } from '@/types';

export default function ProfilePage() {
  const { user } = useUser();
  const router = useRouter();
  const toast = useToast();

  // Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // Recent submissions
  const [recentReceipts, setRecentReceipts] = useState<Receipt[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(true);

  const fetchRecentReceipts = useCallback(async () => {
    setReceiptsLoading(true);
    try {
      const res = await fetch('/api/receipts?page=1&pageSize=5&mine=true');
      const json = await res.json();
      if (res.ok) {
        setRecentReceipts(json.data || []);
      }
    } catch {
      // silent
    } finally {
      setReceiptsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecentReceipts();
  }, [fetchRecentReceipts]);

  // Password validation
  const validatePassword = (pw: string): string => {
    if (pw.length < 8) return '비밀번호는 8자 이상이어야 합니다';
    if (!/[a-zA-Z]/.test(pw)) return '영문자를 포함해야 합니다';
    if (!/[0-9]/.test(pw)) return '숫자를 포함해야 합니다';
    return '';
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    if (!newPassword) {
      setPasswordError('새 비밀번호를 입력해주세요');
      return;
    }

    const validation = validatePassword(newPassword);
    if (validation) {
      setPasswordError(validation);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('새 비밀번호가 일치하지 않습니다');
      return;
    }

    setPasswordLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;

      toast.success('비밀번호가 변경되었습니다');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : '비밀번호 변경에 실패했습니다'
      );
    } finally {
      setPasswordLoading(false);
    }
  };

  if (!user) return null;

  const statusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return '대기중';
      case 'approved':
        return '승인됨';
      case 'rejected':
        return '반려됨';
      default:
        return status;
    }
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-500 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/20 p-2.5">
              <UserIcon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">내 정보</h1>
              <p className="text-sm text-white/80 mt-0.5">프로필 및 비밀번호 관리</p>
            </div>
          </div>
        </div>

        {/* Profile info */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">기본 정보</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">이름</span>
              <span className="text-sm font-medium text-gray-900">{user.name}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">이메일</span>
              <span className="text-sm font-medium text-gray-900">{user.email}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">직분</span>
              <span className="text-sm font-medium text-gray-900">{user.position || '-'}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">역할</span>
              <span className="text-sm font-medium text-gray-900">{formatRole(user.role)}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-500">상태</span>
              <StatusBadge status={user.status} />
            </div>
          </div>
        </div>

        {/* Password change */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="h-4 w-4 text-gray-500" />
            <h2 className="text-base font-semibold text-gray-900">비밀번호 변경</h2>
          </div>

          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                현재 비밀번호
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="현재 비밀번호"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                  focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                  outline-none transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                새 비밀번호
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setPasswordError('');
                }}
                placeholder="8자 이상, 영문 + 숫자 포함"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                  focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                  outline-none transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                새 비밀번호 확인
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setPasswordError('');
                }}
                placeholder="새 비밀번호 다시 입력"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                  focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                  outline-none transition-shadow"
              />
            </div>

            {passwordError && (
              <p className="text-sm text-danger-600">{passwordError}</p>
            )}

            <div className="flex justify-end">
              <Button type="submit" loading={passwordLoading}>
                비밀번호 변경
              </Button>
            </div>
          </form>
        </div>

        {/* Recent submissions */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-500" />
              <h2 className="text-base font-semibold text-gray-900">최근 제출 내역</h2>
            </div>
            <button
              onClick={() => router.push('/receipts/my')}
              className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-0.5"
            >
              전체보기
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {receiptsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex items-center gap-3">
                  <div className="h-4 bg-gray-200 rounded w-20" />
                  <div className="h-4 bg-gray-200 rounded flex-1" />
                  <div className="h-4 bg-gray-200 rounded w-16" />
                </div>
              ))}
            </div>
          ) : recentReceipts.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              제출 내역이 없습니다
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {recentReceipts.map((r) => (
                <button
                  key={r.id}
                  onClick={() => router.push(`/receipts/${r.id}`)}
                  className="w-full flex items-center justify-between py-3 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {r.description}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDate(r.date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        r.status === 'approved'
                          ? 'bg-success-50 text-success-700'
                          : r.status === 'rejected'
                          ? 'bg-danger-50 text-danger-700'
                          : 'bg-yellow-50 text-yellow-700'
                      }`}
                    >
                      {statusLabel(r.status)}
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
