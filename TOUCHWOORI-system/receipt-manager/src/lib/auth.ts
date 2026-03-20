import { createServerClient } from '@/lib/supabase-server';
import type { User, Role } from '@/types';

/**
 * 현재 로그인된 사용자의 프로필을 가져옵니다.
 * 로그인되지 않았으면 null 반환.
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createServerClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) return null;

  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single();

  return data as User | null;
}

/**
 * 역할 기반 접근 제어.
 * 허용된 역할이 아니면 에러를 throw합니다.
 */
export async function requireRole(allowedRoles: Role[]): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error('인증이 필요합니다');
  }

  if (user.status !== 'active') {
    throw new Error('승인 대기중입니다');
  }

  if (!user.role || !allowedRoles.includes(user.role)) {
    throw new Error('접근 권한이 없습니다');
  }

  return user;
}

/**
 * 활성 사용자인지 확인합니다.
 */
export async function requireActive(): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error('인증이 필요합니다');
  }

  if (user.status !== 'active') {
    throw new Error('승인 대기중입니다');
  }

  if (!user.role) {
    throw new Error('역할이 지정되지 않았습니다');
  }

  return user;
}
