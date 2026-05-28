'use client';

export const runtime = 'edge';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck, ChartNoAxesColumnIncreasing, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useActiveDept } from '@/contexts/DepartmentContext';
import type { AttendanceMember, AttendanceRecord, AttendanceSession, AttendanceStatus } from '@/types';

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

const STATUS_SHORT_LABELS: Record<AttendanceStatus, string> = {
  present: '출',
  absent: '결',
  late: '지',
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

function monthLabel(month: string) {
  const [year, monthNumber] = month.split('-');
  return `${year}년 ${Number(monthNumber)}월`;
}

function shiftMonth(month: string, amount: number) {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return date.toISOString().slice(0, 7);
}

function makeMonth(year: string, monthNumber: string) {
  return `${year}-${monthNumber.padStart(2, '0')}`;
}

function countStudentAttendance(records: AttendanceRecord[]) {
  return records.filter((record) => record.status === 'present' || record.status === 'late').length;
}

function countTeacherAttendance(records: AttendanceRecord[]) {
  return records.filter((record) => record.status === 'present').length;
}

export default function AttendanceStatisticsPage() {
  const { activeDept } = useActiveDept();
  const toast = useToast();
  const [month, setMonth] = useState(currentMonthInKorea);
  const [data, setData] = useState<StatisticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const selectedYear = month.slice(0, 4);
  const selectedMonthNumber = month.slice(5, 7);
  const yearOptions = useMemo(() => {
    const currentYear = Number(currentMonthInKorea().slice(0, 4));
    const selected = Number(selectedYear);
    const start = Math.min(currentYear - 1, selected - 1);
    const end = Math.max(currentYear + 1, selected + 1);
    return Array.from({ length: end - start + 1 }, (_, index) => String(start + index));
  }, [selectedYear]);

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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '출석 통계를 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, [activeDept, toast]);

  useEffect(() => {
    loadStatistics(month);
  }, [loadStatistics, month]);

  const sessions = useMemo(() => [...(data?.sessions || [])].sort((a, b) =>
    a.attendance_date.localeCompare(b.attendance_date)
  ), [data]);
  const memberRows = useMemo(() => {
    const rowMap = new Map<string, { member: AttendanceMember; recordsBySession: Record<string, AttendanceRecord> }>();
    for (const record of data?.records || []) {
      if (!record.member) continue;
      const row = rowMap.get(record.member.id) || { member: record.member, recordsBySession: {} };
      row.recordsBySession[record.session_id] = record;
      rowMap.set(record.member.id, row);
    }

    const rows = Array.from(rowMap.values());
    const teachers = rows
      .filter((row) => row.member.member_type === 'teacher')
      .sort((a, b) => a.member.name.localeCompare(b.member.name, 'ko'));
    const students = rows
      .filter((row) => row.member.member_type === 'student')
      .sort((a, b) =>
        Number(Boolean(a.member.is_long_absent)) - Number(Boolean(b.member.is_long_absent))
        || (a.member.grade || 0) - (b.member.grade || 0)
        || a.member.name.localeCompare(b.member.name, 'ko'));

    return { teachers, students };
  }, [data]);
  const firstSessionDate = sessions[0]?.attendance_date;
  const lastSessionDate = sessions[sessions.length - 1]?.attendance_date;

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
                <p className="mt-0.5 text-sm text-white/80">월별 개인 출석 흐름을 한눈에 확인합니다</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-xl border border-white/25 bg-white/15 p-1">
                <button
                  type="button"
                  onClick={() => setMonth((current) => shiftMonth(current, -1))}
                  className="rounded-lg p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                  aria-label="이전 달"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <select
                  value={selectedYear}
                  onChange={(event) => setMonth(makeMonth(event.target.value, selectedMonthNumber))}
                  className="h-9 rounded-lg border border-white/20 bg-white/90 px-3 text-sm font-semibold text-gray-900"
                  aria-label="연도 선택"
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>{year}년</option>
                  ))}
                </select>
                <select
                  value={selectedMonthNumber}
                  onChange={(event) => setMonth(makeMonth(selectedYear, event.target.value))}
                  className="ml-1 h-9 rounded-lg border border-white/20 bg-white/90 px-3 text-sm font-semibold text-gray-900"
                  aria-label="월 선택"
                >
                  {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((monthNumber) => (
                    <option key={monthNumber} value={monthNumber}>{Number(monthNumber)}월</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setMonth((current) => shiftMonth(current, 1))}
                  className="rounded-lg p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                  aria-label="다음 달"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <Link href="/attendance">
                <Button variant="secondary" className="!border-white/30 !bg-white/20 !text-white hover:!bg-white/30">
                  <CalendarCheck className="h-4 w-4" />출석 체크
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {loading ? (
          <PageSkeleton />
        ) : sessions.length === 0 ? (
          <div className="glass-panel rounded-2xl p-10 text-center">
            <ChartNoAxesColumnIncreasing className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 font-semibold text-gray-800">{monthLabel(month)}에 열린 출석 회차가 없습니다</p>
            <p className="mt-1 text-sm text-gray-500">출석 체크에서 주일 회차를 열면 여기에 집계됩니다.</p>
          </div>
        ) : (
          <section className="glass-panel rounded-2xl p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary-600" />
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{monthLabel(month)} 월간 출석표</h2>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {firstSessionDate === lastSessionDate ? firstSessionDate : `${firstSessionDate} ~ ${lastSessionDate}`} · 출=출석, 지=지각, 결=결석
                  </p>
                </div>
              </div>
              <p className="rounded-full bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700">
                지각은 참석으로 포함
              </p>
            </div>
            <AttendanceMatrix title="학생" rows={memberRows.students} sessions={sessions} />
            <div className="mt-6">
              <AttendanceMatrix title="교사" rows={memberRows.teachers} sessions={sessions} compact />
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function AttendanceMatrix({
  title,
  rows,
  sessions,
  compact = false,
}: {
  title: string;
  rows: { member: AttendanceMember; recordsBySession: Record<string, AttendanceRecord> }[];
  sessions: AttendanceSession[];
  compact?: boolean;
}) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-bold text-gray-800">{title}</h3>
      <div className="overflow-x-auto rounded-xl border border-white/70">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-gray-50/90 text-xs font-semibold text-gray-500">
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50/95 px-4 py-3 text-left">이름</th>
              {sessions.map((session) => (
                <th key={session.id} className="px-3 py-3 text-center">
                  <span className="block whitespace-nowrap">{session.week_label}</span>
                  <span className="mt-0.5 block whitespace-nowrap font-normal text-gray-400">{session.attendance_date.slice(5)}</span>
                </th>
              ))}
              <th className="px-3 py-3 text-center">참석</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white/65">
            {rows.map(({ member, recordsBySession }) => {
              const records = sessions
                .map((session) => recordsBySession[session.id])
                .filter((record): record is AttendanceRecord => Boolean(record));
              const attended = member.member_type === 'teacher'
                ? countTeacherAttendance(records)
                : countStudentAttendance(records);
              return (
                <tr key={member.id} className={member.is_long_absent ? 'bg-gray-50/80 text-gray-500' : ''}>
                  <td className="sticky left-0 z-10 bg-inherit px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{member.name}</span>
                      {!compact && member.grade && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${GRADE_STYLES[member.grade]}`}>{member.grade}학년</span>
                      )}
                      {member.is_long_absent && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">장결</span>
                      )}
                    </div>
                  </td>
                  {sessions.map((session) => {
                    const record = recordsBySession[session.id];
                    return (
                      <td key={session.id} className="px-3 py-3 text-center">
                        {record ? (
                          <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-bold ${STATUS_STYLES[record.status].className}`}>
                            {STATUS_SHORT_LABELS[record.status]}
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-center font-bold text-gray-900">
                    {attended}/{sessions.length}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={sessions.length + 2} className="px-4 py-8 text-center text-sm text-gray-500">
                  표시할 {title} 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
