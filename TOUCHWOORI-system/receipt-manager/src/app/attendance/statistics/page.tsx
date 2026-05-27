'use client';

export const runtime = 'edge';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck, ChartNoAxesColumnIncreasing } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useActiveDept } from '@/contexts/DepartmentContext';
import type { AttendanceRecord, AttendanceSession, AttendanceStatus } from '@/types';

interface StatisticsData {
  month: string;
  sessions: AttendanceSession[];
  records: AttendanceRecord[];
}

const GRADE_STYLES: Record<number, string> = {
  1: 'bg-amber-50 text-amber-700',
  2: 'bg-blue-50 text-blue-700',
  3: 'bg-purple-50 text-purple-700',
};

const STATUS_STYLES: Record<AttendanceStatus, { label: string; className: string }> = {
  present: { label: '출석', className: 'bg-success-50 text-success-700' },
  absent: { label: '결석', className: 'bg-danger-50 text-danger-700' },
  late: { label: '지각', className: 'bg-warning-50 text-warning-600' },
};

function currentMonthInKorea() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value || '';
  const month = parts.find((part) => part.type === 'month')?.value || '';
  return `${year}-${month}`;
}

function countStudentAttendance(records: AttendanceRecord[]) {
  return records.filter((record) => record.status === 'present' || record.status === 'late').length;
}

function countTeacherAttendance(records: AttendanceRecord[]) {
  return records.filter((record) => record.status === 'present').length;
}

function countStatus(records: AttendanceRecord[], status: AttendanceStatus) {
  return records.filter((record) => record.status === status).length;
}

export default function AttendanceStatisticsPage() {
  const { activeDept } = useActiveDept();
  const toast = useToast();
  const [month, setMonth] = useState(currentMonthInKorea);
  const [data, setData] = useState<StatisticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState('');

  const loadStatistics = useCallback(async (selectedMonth: string) => {
    if (!activeDept) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ department_id: activeDept, month: selectedMonth });
      const res = await fetch(`/api/attendance/statistics?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const result = json.data as StatisticsData;
      setData(result);
      setSelectedSessionId((current) => (
        result.sessions.some((session) => session.id === current)
          ? current
          : result.sessions[result.sessions.length - 1]?.id || ''
      ));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '출석 통계를 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, [activeDept, toast]);

  useEffect(() => {
    loadStatistics(month);
  }, [loadStatistics, month]);

  const sessionsWithRecords = useMemo(() => (data?.sessions || []).map((session) => {
    const records = (data?.records || []).filter((record) => record.session_id === session.id);
    const teachers = records.filter((record) => record.member?.member_type === 'teacher');
    const students = records.filter((record) => record.member?.member_type === 'student');
    return { session, teachers, students };
  }), [data]);

  const selectedWeek = sessionsWithRecords.find(({ session }) => session.id === selectedSessionId);
  const monthlyTeachers = sessionsWithRecords.flatMap(({ teachers }) => teachers);
  const monthlyStudents = sessionsWithRecords.flatMap(({ students }) => students);
  const selectedTeacherRecords = selectedWeek?.teachers || [];
  const selectedStudentRecords = [...(selectedWeek?.students || [])].sort((a, b) =>
    Number(Boolean(a.member?.is_long_absent)) - Number(Boolean(b.member?.is_long_absent))
    || (a.member?.grade || 0) - (b.member?.grade || 0)
    || (a.member?.name || '').localeCompare(b.member?.name || '', 'ko'));

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="rounded-2xl bg-gradient-to-r from-primary-700 to-primary-500 p-6 text-white shadow-[0_18px_42px_rgba(86,80,207,0.2)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/20 p-2.5">
                <ChartNoAxesColumnIncreasing className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">출석 통계</h1>
                <p className="mt-0.5 text-sm text-white/80">월별 · 주차별 교사 및 학생 출석 현황을 확인합니다</p>
              </div>
            </div>
            <Link href="/attendance">
              <Button variant="secondary" className="!border-white/30 !bg-white/20 !text-white hover:!bg-white/30">
                <CalendarCheck className="h-4 w-4" />출석 체크
              </Button>
            </Link>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-4 sm:p-5">
          <label className="mb-1 block text-xs font-semibold text-gray-500">조회 월</label>
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          />
          <p className="mt-3 text-xs text-gray-500">열린 출석 회차의 기록을 기준으로 집계합니다. 학생 참석 인원에는 지각이 포함됩니다.</p>
        </div>

        {loading ? (
          <PageSkeleton />
        ) : sessionsWithRecords.length === 0 ? (
          <div className="glass-panel rounded-2xl p-10 text-center">
            <ChartNoAxesColumnIncreasing className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 font-semibold text-gray-800">이 달에 열린 출석 회차가 없습니다</p>
            <p className="mt-1 text-sm text-gray-500">출석 체크에서 주일 회차를 열면 여기에 집계됩니다.</p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="glass-panel rounded-2xl p-5">
                <p className="text-sm font-semibold text-gray-500">집계 주차</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{sessionsWithRecords.length}회</p>
              </div>
              <div className="glass-panel rounded-2xl p-5">
                <p className="text-sm font-semibold text-gray-500">교사 누적 참석</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{countTeacherAttendance(monthlyTeachers)}명</p>
                <p className="mt-1 text-xs text-gray-500">출석으로 기록된 회차별 인원 합계</p>
              </div>
              <div className="glass-panel rounded-2xl p-5">
                <p className="text-sm font-semibold text-gray-500">학생 누적 참석</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{countStudentAttendance(monthlyStudents)}명</p>
                <p className="mt-1 text-xs text-gray-500">출석 + 지각 회차별 인원 합계</p>
              </div>
            </div>

            <section className="glass-panel rounded-2xl p-4 sm:p-5">
              <h2 className="mb-4 text-lg font-bold text-gray-900">{Number(month.slice(5))}월 주차별 현황</h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {sessionsWithRecords.map(({ session, teachers, students }) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setSelectedSessionId(session.id)}
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      selectedSessionId === session.id
                        ? 'border-primary-400 bg-primary-50/70'
                        : 'border-white/70 bg-white/70 hover:border-primary-200'
                    }`}
                  >
                    <p className="font-bold text-gray-900">{session.week_label}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{session.attendance_date}</p>
                    <div className="mt-4 flex justify-between text-sm">
                      <span className="text-gray-500">교사</span>
                      <span className="font-semibold text-gray-900">{countTeacherAttendance(teachers)} / {teachers.length}명</span>
                    </div>
                    <div className="mt-2 flex justify-between text-sm">
                      <span className="text-gray-500">학생</span>
                      <span className="font-semibold text-gray-900">{countStudentAttendance(students)} / {students.length}명</span>
                    </div>
                    <p className="mt-3 text-xs text-gray-500">
                      학생 출석 {countStatus(students, 'present')} · 지각 {countStatus(students, 'late')} · 결석 {countStatus(students, 'absent')}
                    </p>
                  </button>
                ))}
              </div>
            </section>

            {selectedWeek && (
              <section className="glass-panel rounded-2xl p-4 sm:p-5">
                <h2 className="text-lg font-bold text-gray-900">{selectedWeek.session.week_label} 상세 현황</h2>
                <p className="mt-1 text-sm text-gray-500">{selectedWeek.session.attendance_date} · {selectedWeek.session.title}</p>
                <div className="mt-5 grid gap-5 lg:grid-cols-2">
                  <div>
                    <h3 className="mb-3 text-sm font-bold text-gray-800">교사</h3>
                    <div className="space-y-2">
                      {selectedTeacherRecords.map((record) => (
                        <StatusRow key={record.id} record={record} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="mb-3 text-sm font-bold text-gray-800">학생</h3>
                    <div className="space-y-2">
                      {selectedStudentRecords.map((record) => (
                        <StatusRow key={record.id} record={record} />
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function StatusRow({ record }: { record: AttendanceRecord }) {
  if (!record.member) return null;
  const status = STATUS_STYLES[record.status];
  const grade = record.member.grade;
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/70 bg-white/70 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-gray-900">{record.member.name}</p>
        {record.member.member_type === 'student' && grade && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${GRADE_STYLES[grade]}`}>{grade}학년</span>
        )}
        {record.member.is_long_absent && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">장결</span>
        )}
      </div>
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
    </div>
  );
}
