import { createServerClient, createServiceClient } from '@/lib/supabase-server';
import {
  ATTENDANCE_CHECK_ROLES,
  ATTENDANCE_CROSS_DEPT_ROLES,
  ATTENDANCE_MANAGE_ROLES,
} from '@/lib/attendance';
import type { Role } from '@/types';

type AttendanceAccessMode = 'check' | 'manage';

export async function getAttendanceAccess(mode: AttendanceAccessMode, requestedDepartment?: string | null) {
  const supabase = await createServerClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) {
    return { error: '인증이 필요합니다', status: 401 } as const;
  }

  const { data: profile } = await supabase
    .from('users')
    .select('id, role, status, department_id')
    .eq('id', authUser.id)
    .single();

  if (!profile || profile.status !== 'active' || !profile.role) {
    return { error: '접근 권한이 없습니다', status: 403 } as const;
  }

  const role = profile.role as Role;
  const allowedRoles = mode === 'manage' ? ATTENDANCE_MANAGE_ROLES : ATTENDANCE_CHECK_ROLES;
  if (!allowedRoles.includes(role)) {
    return { error: '출석 관리 권한이 없습니다', status: 403 } as const;
  }

  const canChooseDepartment = ATTENDANCE_CROSS_DEPT_ROLES.includes(role);
  const departmentId = canChooseDepartment && requestedDepartment
    ? requestedDepartment
    : profile.department_id;

  return {
    authUser,
    profile: { ...profile, role },
    departmentId,
    serviceClient: createServiceClient(),
  } as const;
}
