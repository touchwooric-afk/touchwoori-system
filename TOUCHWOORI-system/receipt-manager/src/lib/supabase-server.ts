import { createServerClient as createSSRServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// 서버 클라이언트 (Server Components, API Routes)
export async function createServerClient() {
  const cookieStore = await cookies();

  return createSSRServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as Record<string, unknown>)
            );
          } catch {
            // Server Component에서는 쿠키 설정 불가 (무시)
          }
        },
      },
    }
  );
}

// 서비스 역할 클라이언트 (관리자 작업 전용 - API Routes에서만 사용)
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
