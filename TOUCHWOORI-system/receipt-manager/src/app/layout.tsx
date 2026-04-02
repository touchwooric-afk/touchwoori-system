import type { Metadata } from 'next';
import './globals.css';
import { UserProvider } from '@/hooks/useUser';
import { ToastProvider } from '@/components/ui/Toast';
import { DepartmentProvider } from '@/contexts/DepartmentContext';

export const metadata: Metadata = {
  title: 'TOUCHWOORI - 고등부 영수증 관리',
  description: '교회 고등부 영수증 관리 시스템',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="antialiased">
        <UserProvider>
          <DepartmentProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </DepartmentProvider>
        </UserProvider>
      </body>
    </html>
  );
}
