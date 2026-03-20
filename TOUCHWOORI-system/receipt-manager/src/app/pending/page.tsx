'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { Clock } from 'lucide-react';
import Button from '@/components/ui/Button';

export default function PendingPage() {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-info-50 px-4">
      <div className="w-full max-w-sm text-center">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="rounded-full bg-warning-50 p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Clock className="h-8 w-8 text-warning-500" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">승인 대기중</h2>
          <p className="mt-3 text-sm text-gray-500 leading-relaxed">
            계정 신청이 완료되었습니다.<br />
            관리자가 승인하면 시스템을 사용할 수 있습니다.
          </p>
          <div className="mt-6">
            <Button variant="secondary" onClick={handleLogout} className="w-full">
              로그아웃
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
