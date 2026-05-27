'use client';

export const runtime = 'edge';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Pencil, Plus, UserRoundCog } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useActiveDept } from '@/contexts/DepartmentContext';
import type { AttendanceMember, AttendanceMemberType, AttendanceStudentKind } from '@/types';

interface MemberForm {
  member_type: AttendanceMemberType;
  name: string;
  grade: number;
  position: string;
  is_homeroom: boolean;
  student_kind: AttendanceStudentKind;
  active_from: string;
  active_until: string;
  is_active: boolean;
  memo: string;
}

const EMPTY_FORM: MemberForm = {
  member_type: 'student',
  name: '',
  grade: 1,
  position: '',
  is_homeroom: false,
  student_kind: 'enrolled',
  active_from: '',
  active_until: '',
  is_active: true,
  memo: '',
};

export default function AttendanceRosterPage() {
  const { activeDept } = useActiveDept();
  const toast = useToast();
  const [members, setMembers] = useState<AttendanceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MemberForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const loadMembers = useCallback(async () => {
    if (!activeDept) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ department_id: activeDept, include_inactive: 'true' });
      const res = await fetch(`/api/attendance/roster?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMembers(json.data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '명단을 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, [activeDept, toast]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const openAdd = (type: AttendanceMemberType) => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, member_type: type });
    setModalOpen(true);
  };

  const openEdit = (member: AttendanceMember) => {
    setEditingId(member.id);
    setForm({
      member_type: member.member_type,
      name: member.name,
      grade: member.grade || 1,
      position: member.position || '',
      is_homeroom: member.is_homeroom,
      student_kind: member.student_kind || 'enrolled',
      active_from: member.active_from,
      active_until: member.active_until || '',
      is_active: member.is_active,
      memo: member.memo || '',
    });
    setModalOpen(true);
  };

  const saveMember = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/attendance/roster', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          department_id: activeDept,
          ...form,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(editingId ? '명단 정보가 수정되었습니다' : '명단에 등록되었습니다');
      setModalOpen(false);
      await loadMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  const teachers = members.filter((member) => member.member_type === 'teacher');
  const students = members.filter((member) => member.member_type === 'student');

  const renderMember = (member: AttendanceMember) => (
    <div key={member.id} className={`flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 last:border-0 ${!member.is_active ? 'opacity-50' : ''}`}>
      <div>
        <p className="text-sm font-semibold text-gray-900">
          {member.name}
          {member.student_kind === 'newcomer' && <span className="ml-2 rounded-full bg-info-50 px-2 py-0.5 text-xs text-info-600">새친구</span>}
          {member.is_homeroom && <span className="ml-2 rounded-full bg-primary-50 px-2 py-0.5 text-xs text-primary-700">담임</span>}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {member.member_type === 'teacher' ? member.position || '교사' : `${member.grade}학년`}
          {member.active_until ? ` · ${member.active_until}까지` : ''}
          {!member.is_active ? ' · 비활성' : ''}
        </p>
      </div>
      <Button size="sm" variant="secondary" onClick={() => openEdit(member)}>
        <Pencil className="h-3.5 w-3.5" />
        수정
      </Button>
    </div>
  );

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="rounded-2xl bg-gradient-to-r from-primary-700 to-primary-500 p-6 text-white shadow-[0_18px_42px_rgba(86,80,207,0.2)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/20 p-2.5"><UserRoundCog className="h-6 w-6" /></div>
              <div>
                <h1 className="text-2xl font-bold">출석 명단 관리</h1>
                <p className="mt-0.5 text-sm text-white/80">학생과 교사 정보, 담임 및 재직 기간을 관리합니다</p>
              </div>
            </div>
            <Link href="/attendance">
              <Button variant="secondary" className="!border-white/30 !bg-white/20 !text-white hover:!bg-white/30">
                <ArrowLeft className="h-4 w-4" />출석 체크
              </Button>
            </Link>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={8} cols={3} />
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="glass-panel overflow-hidden rounded-2xl">
              <div className="flex items-center justify-between border-b border-white/70 px-4 py-4">
                <div>
                  <h2 className="font-bold text-gray-900">교사 명단</h2>
                  <p className="text-xs text-gray-500">{teachers.length}명 등록</p>
                </div>
                <Button size="sm" onClick={() => openAdd('teacher')}><Plus className="h-4 w-4" />교사 추가</Button>
              </div>
              <div>{teachers.map(renderMember)}</div>
            </section>
            <section className="glass-panel overflow-hidden rounded-2xl">
              <div className="flex items-center justify-between border-b border-white/70 px-4 py-4">
                <div>
                  <h2 className="font-bold text-gray-900">학생 명단</h2>
                  <p className="text-xs text-gray-500">{students.length}명 등록</p>
                </div>
                <Button size="sm" onClick={() => openAdd('student')}><Plus className="h-4 w-4" />학생 추가</Button>
              </div>
              <div>{students.map(renderMember)}</div>
            </section>
          </div>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? '명단 정보 수정' : '명단 등록'}>
        <form onSubmit={saveMember} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">구분</label>
              <select
                value={form.member_type}
                disabled={Boolean(editingId)}
                onChange={(event) => setForm((current) => ({ ...current, member_type: event.target.value as AttendanceMemberType }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
              >
                <option value="student">학생</option>
                <option value="teacher">교사</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">이름</label>
              <input
                required
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {form.member_type === 'student' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">학년</label>
                <select
                  value={form.grade}
                  onChange={(event) => setForm((current) => ({ ...current, grade: Number(event.target.value) }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value={1}>1학년</option>
                  <option value={2}>2학년</option>
                  <option value={3}>3학년</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">등록 구분</label>
                <select
                  value={form.student_kind}
                  onChange={(event) => setForm((current) => ({ ...current, student_kind: event.target.value as AttendanceStudentKind }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="enrolled">재적 학생</option>
                  <option value="newcomer">새친구</option>
                </select>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">직분</label>
                <input
                  value={form.position}
                  onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))}
                  placeholder="교사, 총무교사, 부장교사"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_homeroom}
                  onChange={(event) => setForm((current) => ({ ...current, is_homeroom: event.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600"
                />
                담임선생님으로 표시
              </label>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">활동 시작일</label>
              <input
                type="date"
                value={form.active_from}
                onChange={(event) => setForm((current) => ({ ...current, active_from: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">활동 종료일</label>
              <input
                type="date"
                value={form.active_until}
                onChange={(event) => setForm((current) => ({ ...current, active_until: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">메모</label>
            <input
              value={form.memo}
              onChange={(event) => setForm((current) => ({ ...current, memo: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-primary-600"
            />
            현재 명단에서 활성화
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>취소</Button>
            <Button type="submit" loading={submitting}>저장</Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
