import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// 인증 없이 접근 가능한 경로
const PUBLIC_PATHS = ['/login', '/signup', '/reset-password'];

// pending 사용자가 접근 가능한 경로
const PENDING_PATHS = ['/pending'];

// master 전용 경로
const MASTER_PATHS = ['/master'];

// accountant 이상 전용 경로
const ACCOUNTANT_PATHS = [
  '/receipts/pending',
  '/receipts/new',
  '/ledger/manage',
  '/excel',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 정적 파일, API 라우트, _next 경로는 통과
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') // 정적 파일 (favicon 등)
  ) {
    return NextResponse.next();
  }

  // Supabase 클라이언트 생성 (쿠키 기반 세션)
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }: { name: string; value: string }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options?: Record<string, unknown> }) =>
            response.cookies.set(name, value, options as Record<string, unknown>)
          );
        },
      },
    }
  );

  // 세션 갱신
  const { data: { user: authUser } } = await supabase.auth.getUser();

  // 공개 페이지는 인증 불필요
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    // 이미 로그인된 사용자가 로그인/회원가입 페이지에 접근하면 홈으로
    if (authUser) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return response;
  }

  // 인증 안 된 사용자 → 로그인으로
  if (!authUser) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 사용자 프로필 조회
  const { data: profile } = await supabase
    .from('users')
    .select('status, role')
    .eq('id', authUser.id)
    .single();

  // 프로필이 없으면 (비정상 상태) 로그인으로
  if (!profile) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // pending 사용자 처리
  if (profile.status === 'pending') {
    if (!PENDING_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
      return NextResponse.redirect(new URL('/pending', request.url));
    }
    return response;
  }

  // inactive 사용자 처리
  if (profile.status === 'inactive') {
    // 로그아웃 처리 후 로그인 페이지로
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // active 사용자가 /pending에 접근하면 홈으로
  if (PENDING_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // 역할 기반 접근 제어
  const role = profile.role;

  // master 전용 경로
  if (MASTER_PATHS.some((p) => pathname.startsWith(p))) {
    if (role !== 'master') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // accountant 이상 전용 경로
  if (ACCOUNTANT_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    if (role !== 'master' && role !== 'accountant') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * 아래 경로를 제외한 모든 요청에 미들웨어 적용:
     * - _next/static (정적 파일)
     * - _next/image (이미지 최적화)
     * - favicon.ico (파비콘)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
