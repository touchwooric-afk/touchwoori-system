'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  ClipboardList,
  BookOpen,
  FileText,
  FileSpreadsheet,
  Users,
  Tags,
  BadgeCheck,
  UserCircle,
  Upload,
  PlusCircle,
} from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { createClient } from '@/lib/supabase';
import type { Role } from '@/types';

interface SidebarProps {
  role: Role;
  mobile?: boolean;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

function getNavGroups(role: Role, pendingCount?: number, pendingUserCount?: number, rejectedCount?: number): NavGroup[] {
  const groups: NavGroup[] = [];

  // 공통: 대시보드
  groups.push({
    title: '홈',
    items: [{ label: '대시보드', href: '/', icon: LayoutDashboard }],
  });

  const isMaster     = role === 'master';
  const isSubMaster  = role === 'sub_master';
  const isAccountant = role === 'accountant';
  const isAuditor    = role === 'auditor';
  const isTeacher    = role === 'teacher';
  const canWrite     = isMaster || isAccountant; // 재정 쓰기 권한

  // 시스템 관리
  if (isMaster) {
    groups.push({
      title: '시스템 관리',
      items: [
        { label: '사용자 관리', href: '/master/users', icon: Users, badge: pendingUserCount },
        { label: '카테고리 관리', href: '/master/categories', icon: Tags },
        { label: '직분 관리', href: '/master/positions', icon: BadgeCheck },
      ],
    });
  }

  // 운영 (sub_master: 사용자 관리만)
  if (isSubMaster) {
    groups.push({
      title: '운영',
      items: [
        { label: '사용자 관리', href: '/master/users', icon: Users, badge: pendingUserCount },
      ],
    });
  }

  // 영수증 (auditor/sub_master는 제출/승인 메뉴 없음)
  if (!isAuditor && !isSubMaster) {
    groups.push({
      title: '영수증',
      items: [
        { label: '영수증 제출', href: '/receipts/upload', icon: Upload },
        { label: '내 제출 내역', href: '/receipts/my', icon: ClipboardList, badge: rejectedCount },
        ...(canWrite
          ? [
              { label: '미승인 영수증', href: '/receipts/pending', icon: ClipboardList, badge: pendingCount },
              { label: '직접 입력', href: '/receipts/new', icon: PlusCircle },
            ]
          : []),
      ],
    });
  }

  // 회계장부
  groups.push({
    title: '회계장부',
    items: [
      { label: '회계장부 조회', href: '/ledger', icon: BookOpen },
      ...(canWrite
        ? [
            { label: '회계장부 관리', href: '/ledger/manage', icon: BookOpen },
            { label: '엑셀 내보내기', href: '/excel/export', icon: FileSpreadsheet },
          ]
        : []),
    ],
  });

  // 결산
  groups.push({
    title: '결산',
    items: [
      { label: '결산 및 지출증빙', href: '/settlements', icon: FileText },
    ],
  });

  return groups;
}

export default function Sidebar({ role, mobile = false }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useUser();
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingUserCount, setPendingUserCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);

  useEffect(() => {
    if (role !== 'accountant' && role !== 'master') return;
    if (!user) return;

    const supabase = createClient();
    let query = supabase
      .from('receipts')
      .select('id')
      .eq('status', 'pending');

    // accountant는 본인 부서만
    if (role === 'accountant' && user.department_id) {
      query = query.eq('department_id', user.department_id);
    }

    query.then(({ data, error }) => {
      const n = error ? 0 : (data?.length ?? 0);
      setPendingCount(n);
    });
  }, [role, user]);

  // 승인 대기 신규 사용자 수 (master / sub_master)
  useEffect(() => {
    if (role !== 'master' && role !== 'sub_master') return;

    const supabase = createClient();
    supabase
      .from('users')
      .select('id')
      .eq('status', 'pending')
      .then(({ data, error }) => {
        setPendingUserCount(error ? 0 : (data?.length ?? 0));
      });
  }, [role]);

  // 반려된 내 영수증 수
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from('receipts')
      .select('id')
      .eq('submitted_by', user.id)
      .eq('status', 'rejected')
      .then(({ data, error }) => {
        setRejectedCount(error ? 0 : (data?.length ?? 0));
      });
  }, [user]);

  const navGroups = getNavGroups(role, pendingCount, pendingUserCount, rejectedCount);

  return (
    <aside className={
      mobile
        ? 'flex flex-col w-full h-full bg-white'
        : 'hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:pt-16 bg-white border-r border-gray-200'
    }>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {navGroups.map((group) => (
          <div key={group.title}>
            <h3 className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {group.title}
            </h3>
            <ul className="mt-2 space-y-0.5">
              {group.items.map((item) => {
                const isActive =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`
                        flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium
                        transition-colors duration-150
                        ${
                          isActive
                            ? 'bg-primary-50 text-primary-700'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }
                      `}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.label}
                      {item.badge != null && item.badge > 0 && (
                        <span
                          style={{
                            marginLeft: 'auto',
                            fontSize: '10px',
                            fontWeight: 700,
                            backgroundColor: '#ef4444',
                            color: '#fff',
                            borderRadius: '9999px',
                            padding: '2px 6px',
                            minWidth: '18px',
                            textAlign: 'center',
                            lineHeight: 1,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {item.badge > 99 ? '99+' : item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* 하단: 프로필 링크 */}
      <div className="border-t border-gray-200 px-3 py-3">
        <Link
          href="/profile"
          className={`
            flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium
            transition-colors duration-150
            ${
              pathname === '/profile'
                ? 'bg-primary-50 text-primary-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }
          `}
        >
          <UserCircle className="h-4 w-4 shrink-0" />
          내 정보
        </Link>
      </div>
    </aside>
  );
}
