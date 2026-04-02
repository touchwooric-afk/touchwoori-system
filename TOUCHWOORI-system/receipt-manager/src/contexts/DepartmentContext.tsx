'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { useUser } from '@/hooks/useUser';
import type { Department } from '@/types';

// 전체 부서 열람 가능한 역할
const CROSS_DEPT_ROLES = ['master', 'sub_master', 'auditor', 'overseer', 'admin_viewer'];

const STORAGE_KEY = 'activeDepartment';

interface DepartmentContextType {
  activeDept: string;
  setActiveDept: (dept: string) => void;
  departments: Department[];
  isCrossDept: boolean;   // 부서 선택기를 보여줄 역할인지
}

const DepartmentContext = createContext<DepartmentContextType | null>(null);

export function DepartmentProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const [activeDept, setActiveDeptState] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);

  const isCrossDept = CROSS_DEPT_ROLES.includes(user?.role ?? '');

  // 부서 목록 로드 (cross-dept 역할만)
  useEffect(() => {
    if (!isCrossDept) return;
    const supabase = createClient();
    supabase
      .from('departments')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => { if (data) setDepartments(data as Department[]); });
  }, [isCrossDept]);

  // 활성 부서 초기화: localStorage → user.department_id 순으로 fallback
  useEffect(() => {
    if (!user?.department_id) return;
    if (isCrossDept) {
      const stored = localStorage.getItem(STORAGE_KEY);
      setActiveDeptState(stored || user.department_id);
    } else {
      // cross-dept 아닌 역할은 항상 본인 부서 고정
      setActiveDeptState(user.department_id);
    }
  }, [user?.department_id, isCrossDept]);

  const setActiveDept = useCallback((dept: string) => {
    setActiveDeptState(dept);
    localStorage.setItem(STORAGE_KEY, dept);
  }, []);

  return (
    <DepartmentContext.Provider value={{ activeDept, setActiveDept, departments, isCrossDept }}>
      {children}
    </DepartmentContext.Provider>
  );
}

export function useActiveDept() {
  const ctx = useContext(DepartmentContext);
  if (!ctx) throw new Error('useActiveDept must be used within DepartmentProvider');
  return ctx;
}
