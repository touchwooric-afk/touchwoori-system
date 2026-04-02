'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useUser } from '@/hooks/useUser';
import { createClient } from '@/lib/supabase';
import Sidebar from './Sidebar';
import BottomTabs from './BottomTabs';
import { PageSkeleton } from '@/components/ui/Skeleton';

function getHonorific(position: string | null | undefined): string {
  if (!position) return '선생님';
  if (position.includes('목사')) return ' 목사님';
  if (position.includes('전도사') || position.includes('교역자')) return ' 전도사님';
  if (position.includes('장로') || position.includes('위원장')) return ' 장로님';
  if (position.includes('권사')) return ' 권사님';
  if (position.includes('집사')) return ' 집사님';
  return ' 선생님';
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <PageSkeleton />
      </div>
    );
  }

  if (!user || !user.role) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 상단 바 */}
      <header className="fixed top-0 left-0 right-0 z-30 h-16 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between h-full px-4 md:px-6">
          {/* 로고 */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden rounded-lg p-2 text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label="메뉴"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Link
              href="/"
              className="text-lg font-bold bg-gradient-to-r from-primary-600 to-primary-500 bg-clip-text text-transparent hover:opacity-80 transition-opacity"
            >
              {user.department_id?.includes('중등부') ? 'DREAMWOORI' : 'TOUCHWOORI'}
            </Link>
          </div>

          {/* 사용자 정보 */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5">
              <span className="text-sm font-bold text-gray-800">{user.name}{getHonorific(user.position)}</span>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-500">{user.department_id}</span>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-500">{user.position}</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="text-[10px]">로그아웃</span>
            </button>
          </div>
        </div>
      </header>

      {/* 모바일 메뉴 오버레이 */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-20 bg-black/40"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="w-64 h-full bg-white pt-16 animate-slide-in-right overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <Sidebar role={user.role} mobile />
          </div>
        </div>
      )}

      {/* PC 사이드바 */}
      <Sidebar role={user.role} />

      {/* 메인 콘텐츠 */}
      <main className="pt-16 pb-20 md:pb-6 md:pl-64">
        <div className="max-w-5xl mx-auto px-4 py-6 md:px-6 animate-fade-in">
          {children}
        </div>
      </main>

      {/* 모바일 하단 탭 */}
      <BottomTabs role={user.role} />
    </div>
  );
}
