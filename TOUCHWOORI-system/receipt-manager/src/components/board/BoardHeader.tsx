'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquareText, PenLine, UserRound } from 'lucide-react';

export default function BoardHeader() {
  const pathname = usePathname();
  const links = [
    { href: '/board', label: '전체 글', icon: MessageSquareText, exact: true },
    { href: '/board/mine', label: '내가 쓴 글', icon: UserRound },
    { href: '/board/new', label: '글쓰기', icon: PenLine },
  ];

  return (
    <>
      <div className="rounded-2xl bg-gradient-to-r from-primary-700 to-primary-500 p-5 text-white shadow-[0_18px_42px_rgba(86,80,207,0.2)] sm:p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-white/20 p-2.5">
            <MessageSquareText className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">소통 게시판</h1>
            <p className="mt-0.5 text-sm text-white/80">부서와 관계없이 함께 소식을 나누는 공간입니다</p>
          </div>
        </div>
      </div>
      <nav className="flex gap-2 overflow-x-auto pb-1">
        {links.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                active ? 'bg-primary-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-primary-50 hover:text-primary-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
