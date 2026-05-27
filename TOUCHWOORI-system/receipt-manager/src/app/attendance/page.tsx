'use client';

export const runtime = 'edge';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarCheck,
  ClipboardCopy,
  Plus,
  Settings,
  Users,
} from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useUser } from '@/hooks/useUser';
import { useActiveDept } from '@/contexts/DepartmentContext';
import { ATTENDANCE_MANAGE_ROLES } from '@/lib/attendance';
import type { AttendanceRecord, AttendanceSession, AttendanceStatus } from '@/types';

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; activeClass: string }[] = [
  { value: 'present', label: '출석', activeClass: 'bg-success-600 text-white border-success-600' },
  { value: 'absent', label: '결석', activeClass: 'bg-danger-600 text-white border-danger-600' },
  { value: 'late', label: '지각', activeClass: 'bg-warning-500 text-white border-warning-500' },
];

interface NewcomerForm {
  name: string;
  grade: number;
}

function AttendanceRow({
  record,
  updating,
  onStatusChange,
}: {
  record: AttendanceRecord;
  updating: boolean;
  onStatusChange: (record: AttendanceRecord, status: AttendanceStatus) => void;
}) {
  if (!record.member) return null;
  const subtitle = record.member.member_type === 'teacher'
    ? [record.member.position, record.member.is_homeroom ? '담임' : null].filter(Boolean).join(' · ')
    : `${record.member.grade}학년${record.member.student_kind === 'newcomer' ? ' · 새친구' : ''}`;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/70 bg-white/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-gray-900">{record.member.name}</p>
        <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>
      </div>
      <div className="flex gap-1.5">
        {STATUS_OPTIONS.map((option) => (
          <button
            type="button"
            key={option.value}
            disabled={updating}
            onClick={() => onStatusChange(record, option.value)}
            className={`min-w-[58px] rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
              record.status === option.value
                ? option.activeClass
                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AttendancePage() {
  const { user } = useUser();
  const { activeDept } = useActiveDept();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [history, setHistory] = useState<AttendanceSession[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [newcomerModalOpen, setNewcomerModalOpen] = useState(false);
  const [newcomerForm, setNewcomerForm] = useState<NewcomerForm>({ name: '', grade: 1 });
  const [addingNewcomer, setAddingNewcomer] = useState(false);

  const canManageRoster = Boolean(user?.role && ATTENDANCE_MANAGE_ROLES.includes(user.role));

  const loadHistory = useCallback(async () => {
    if (!activeDept) return;
    const params = new URLSearchParams({ department_id: activeDept });
    const res = await fetch(`/api/attendance/sessions?${params}`);
    const json = await res.json();
    if (res.ok) setHistory(json.data || []);
  }, [activeDept]);

  const loadSession = useCallback(async (attendanceDate?: string) => {
    if (!activeDept) return;
    setLoading(true);
    try {
      const res = await fetch('/api/attendance/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department_id: activeDept,
          ...(attendanceDate ? { attendance_date: attendanceDate } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSession(json.data.session);
      setRecords(json.data.records || []);
      setSelectedDate(json.data.session.attendance_date);
      await loadHistory();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '출석 회차를 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, [activeDept, loadHistory, toast]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const teacherRecords = useMemo(
    () => records.filter((record) => record.member?.member_type === 'teacher'),
    [records]
  );
  const studentRecords = useMemo(
    () => records.filter((record) => record.member?.member_type === 'student')
      .sort((a, b) => (a.member?.grade || 0) - (b.member?.grade || 0) || (a.member?.name || '').localeCompare(b.member?.name || '', 'ko')),
    [records]
  );

  const countPresent = (items: AttendanceRecord[]) =>
    items.filter((record) => record.status === 'present' || record.status === 'late').length;
  const countStatus = (items: AttendanceRecord[], status: AttendanceStatus) =>
    items.filter((record) => record.status === status).length;

  const handleStatusChange = async (record: AttendanceRecord, status: AttendanceStatus) => {
    if (record.status === status) return;
    setUpdatingId(record.id);
    try {
      const res = await fetch('/api/attendance/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record_id: record.id, status, department_id: activeDept }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setRecords((current) => current.map((item) => item.id === record.id ? json.data : item));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '출석 상태를 변경하지 못했습니다');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleAddNewcomer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session || !newcomerForm.name.trim()) return;
    setAddingNewcomer(true);
    try {
      const res = await fetch('/api/attendance/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department_id: activeDept,
          session_id: session.id,
          member_type: 'student',
          student_kind: 'newcomer',
          name: newcomerForm.name.trim(),
          grade: newcomerForm.grade,
          active_from: session.attendance_date,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success('새친구를 등록하고 출석 처리했습니다');
      setNewcomerModalOpen(false);
      setNewcomerForm({ name: '', grade: 1 });
      await loadSession(session.attendance_date);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '새친구 등록에 실패했습니다');
    } finally {
      setAddingNewcomer(false);
    }
  };

  const copyReport = async () => {
    const report = `${activeDept}\n\n교사 ${countPresent(teacherRecords)}명\n학생 ${countPresent(studentRecords)}명`;
    try {
      await navigator.clipboard.writeText(report);
      toast.success('보고 문구가 복사되었습니다');
    } catch {
      toast.error('보고 문구를 복사하지 못했습니다');
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="rounded-2xl bg-gradient-to-r from-primary-700 to-primary-500 p-6 text-white shadow-[0_18px_42px_rgba(86,80,207,0.2)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/20 p-2.5">
                <CalendarCheck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">출석 체크</h1>
                <p className="mt-0.5 text-sm text-white/80">기본 출석에서 결석과 지각만 한 번에 변경하세요</p>
              </div>
            </div>
            {canManageRoster && (
              <Link href="/attendance/roster">
                <Button variant="secondary" className="!border-white/30 !bg-white/20 !text-white hover:!bg-white/30">
                  <Settings className="h-4 w-4" />
                  명단 관리
                </Button>
              </Link>
            )}
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-4 sm:p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">주일 날짜</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <Button onClick={() => loadSession(selectedDate)} disabled={!selectedDate}>
              회차 열기
            </Button>
            {session && (
              <div className="rounded-lg bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-700">
                {session.week_label} · {session.title}
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            처음 여는 주일 회차에는 당시 활성 명단이 모두 출석으로 자동 등록됩니다.
          </p>
        </div>

        {loading ? (
          <PageSkeleton />
        ) : session && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="glass-panel rounded-2xl p-5">
                <p className="text-sm font-semibold text-gray-500">교사 참석</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{countPresent(teacherRecords)}명</p>
                <p className="mt-1 text-xs text-gray-500">
                  출석 {countStatus(teacherRecords, 'present')} · 지각 {countStatus(teacherRecords, 'late')} · 결석 {countStatus(teacherRecords, 'absent')}
                </p>
              </div>
              <div className="glass-panel rounded-2xl p-5">
                <p className="text-sm font-semibold text-gray-500">학생 참석</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{countPresent(studentRecords)}명</p>
                <p className="mt-1 text-xs text-gray-500">
                  출석 {countStatus(studentRecords, 'present')} · 지각 {countStatus(studentRecords, 'late')} · 결석 {countStatus(studentRecords, 'absent')}
                </p>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
              <div className="space-y-5">
                <section className="glass-panel rounded-2xl p-4 sm:p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary-600" />
                    <h2 className="text-lg font-bold text-gray-900">교사</h2>
                  </div>
                  <div className="space-y-2">
                    {teacherRecords.map((record) => (
                      <AttendanceRow
                        key={record.id}
                        record={record}
                        updating={updatingId === record.id}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                    {teacherRecords.length === 0 && <p className="text-sm text-gray-500">등록된 교사가 없습니다.</p>}
                  </div>
                </section>

                <section className="glass-panel rounded-2xl p-4 sm:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary-600" />
                      <h2 className="text-lg font-bold text-gray-900">학생</h2>
                    </div>
                    <Button size="sm" onClick={() => setNewcomerModalOpen(true)}>
                      <Plus className="h-4 w-4" />
                      새친구 등록
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {studentRecords.map((record) => (
                      <AttendanceRow
                        key={record.id}
                        record={record}
                        updating={updatingId === record.id}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                    {studentRecords.length === 0 && <p className="text-sm text-gray-500">학생 명단을 등록해주세요.</p>}
                  </div>
                </section>
              </div>

              <aside className="space-y-4">
                <div className="glass-panel rounded-2xl p-5">
                  <h2 className="text-sm font-bold text-gray-900">보고용 문구</h2>
                  <pre className="mt-3 rounded-xl bg-gray-50 p-4 font-sans text-sm leading-7 text-gray-800">{`${activeDept}\n\n교사 ${countPresent(teacherRecords)}명\n학생 ${countPresent(studentRecords)}명`}</pre>
                  <Button className="mt-3 w-full" onClick={copyReport}>
                    <ClipboardCopy className="h-4 w-4" />
                    보고 문구 복사
                  </Button>
                </div>
                <div className="glass-panel-soft rounded-2xl p-4">
                  <h2 className="text-sm font-bold text-gray-900">최근 회차</h2>
                  <div className="mt-3 space-y-2">
                    {history.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => loadSession(item.attendance_date)}
                        className="block w-full rounded-lg bg-white/75 px-3 py-2 text-left text-sm text-gray-700 hover:bg-white"
                      >
                        <span className="font-semibold">{item.week_label}</span>
                        <span className="ml-2 text-xs text-gray-400">{item.attendance_date}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          </>
        )}
      </div>

      <Modal isOpen={newcomerModalOpen} onClose={() => setNewcomerModalOpen(false)} title="새친구 등록">
        <form onSubmit={handleAddNewcomer} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">이름</label>
            <input
              value={newcomerForm.name}
              onChange={(event) => setNewcomerForm((current) => ({ ...current, name: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">학년</label>
            <select
              value={newcomerForm.grade}
              onChange={(event) => setNewcomerForm((current) => ({ ...current, grade: Number(event.target.value) }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value={1}>1학년</option>
              <option value={2}>2학년</option>
              <option value={3}>3학년</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setNewcomerModalOpen(false)}>취소</Button>
            <Button type="submit" loading={addingNewcomer}>등록하고 출석 처리</Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
