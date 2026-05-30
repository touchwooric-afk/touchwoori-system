'use client';

export const runtime = 'edge';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, GripVertical, UserRoundCog, UsersRound } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useActiveDept } from '@/contexts/DepartmentContext';
import type { AttendanceMember } from '@/types';

const GRADE_STYLES: Record<number, string> = {
  1: 'bg-amber-50 text-amber-700 ring-amber-100',
  2: 'bg-blue-50 text-blue-700 ring-blue-100',
  3: 'bg-purple-50 text-purple-700 ring-purple-100',
};

function sortStudents(a: AttendanceMember, b: AttendanceMember) {
  return Number(a.is_long_absent) - Number(b.is_long_absent)
    || (a.grade || 0) - (b.grade || 0)
    || a.name.localeCompare(b.name, 'ko');
}

function buildStudentPayload(student: AttendanceMember, departmentId: string, homeroomTeacherId: string | null) {
  return {
    id: student.id,
    department_id: departmentId,
    member_type: 'student',
    name: student.name,
    grade: student.grade || 1,
    position: student.position || '',
    is_homeroom: false,
    student_kind: student.student_kind || 'enrolled',
    is_long_absent: student.is_long_absent,
    homeroom_teacher_id: homeroomTeacherId || '',
    is_active: student.is_active,
    active_from: student.active_from,
    active_until: student.active_until,
    memo: student.memo || '',
  };
}

export default function AttendanceClassAssignmentPage() {
  const { activeDept } = useActiveDept();
  const toast = useToast();
  const [members, setMembers] = useState<AttendanceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    if (!activeDept) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ department_id: activeDept });
      const res = await fetch(`/api/attendance/roster?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMembers(json.data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '반 편성 정보를 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, [activeDept, toast]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const homeroomTeachers = useMemo(
    () => members
      .filter((member) => member.member_type === 'teacher' && member.is_active && member.is_homeroom)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [members]
  );

  const students = useMemo(
    () => members
      .filter((member) =>
        member.member_type === 'student'
        && member.is_active
        && (member.student_kind || 'enrolled') === 'enrolled')
      .sort(sortStudents),
    [members]
  );

  const homeroomTeacherIds = useMemo(
    () => new Set(homeroomTeachers.map((teacher) => teacher.id)),
    [homeroomTeachers]
  );

  const unassignedStudents = useMemo(
    () => students.filter((student) => !student.homeroom_teacher_id || !homeroomTeacherIds.has(student.homeroom_teacher_id)),
    [homeroomTeacherIds, students]
  );

  const studentsByTeacher = useMemo(() => {
    const grouped = new Map<string, AttendanceMember[]>();
    homeroomTeachers.forEach((teacher) => grouped.set(teacher.id, []));
    students.forEach((student) => {
      if (!student.homeroom_teacher_id || !grouped.has(student.homeroom_teacher_id)) return;
      grouped.get(student.homeroom_teacher_id)?.push(student);
    });
    return grouped;
  }, [homeroomTeachers, students]);

  const moveStudent = async (studentId: string, teacherId: string | null) => {
    if (!activeDept) return;
    const student = members.find((member) => member.id === studentId && member.member_type === 'student');
    if (!student || student.homeroom_teacher_id === teacherId) return;

    const previousMembers = members;
    const teacher = teacherId ? homeroomTeachers.find((item) => item.id === teacherId) : null;
    setSavingId(studentId);
    setMembers((current) => current.map((member) => (
      member.id === studentId
        ? {
            ...member,
            homeroom_teacher_id: teacherId,
            homeroom_teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
          }
        : member
    )));

    try {
      const res = await fetch('/api/attendance/roster', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildStudentPayload(student, activeDept, teacherId)),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMembers((current) => current.map((member) => member.id === studentId ? json.data : member));
      toast.success(teacher ? `${student.name} 학생을 ${teacher.name} 선생님 반으로 배정했습니다` : `${student.name} 학생을 미배정으로 옮겼습니다`);
    } catch (err) {
      setMembers(previousMembers);
      toast.error(err instanceof Error ? err.message : '반 배정 저장에 실패했습니다');
    } finally {
      setSavingId(null);
      setDraggingId(null);
      setDropTarget(null);
    }
  };

  const handleDrop = (event: DragEvent, teacherId: string | null) => {
    event.preventDefault();
    const studentId = event.dataTransfer.getData('text/plain') || draggingId;
    if (studentId) void moveStudent(studentId, teacherId);
  };

  const renderStudentCard = (student: AttendanceMember) => (
    <div
      key={student.id}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', student.id);
        event.dataTransfer.effectAllowed = 'move';
        setDraggingId(student.id);
      }}
      onDragEnd={() => {
        setDraggingId(null);
        setDropTarget(null);
      }}
      className={`rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition ${
        draggingId === student.id ? 'scale-[0.98] opacity-50' : 'hover:-translate-y-0.5 hover:shadow-md'
      } ${savingId === student.id ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-gray-300" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-semibold text-gray-900">{student.name}</p>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${GRADE_STYLES[student.grade || 1]}`}>
              {student.grade}학년
            </span>
            {student.is_long_absent && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">장결</span>
            )}
          </div>
          {student.memo && <p className="mt-1 truncate text-xs text-gray-500">{student.memo}</p>}
          <select
            value={student.homeroom_teacher_id || ''}
            disabled={savingId === student.id}
            onChange={(event) => void moveStudent(student.id, event.target.value || null)}
            className="mt-2 w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700"
          >
            <option value="">미배정</option>
            {homeroomTeachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>{teacher.name} 선생님</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );

  const renderDropZone = (id: string, title: string, subtitle: string, zoneStudents: AttendanceMember[], teacherId: string | null) => {
    const isActiveDrop = dropTarget === id;
    return (
      <section
        key={id}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setDropTarget(id);
        }}
        onDragLeave={() => setDropTarget((current) => current === id ? null : current)}
        onDrop={(event) => handleDrop(event, teacherId)}
        className={`flex min-h-[420px] flex-col rounded-2xl border p-4 transition ${
          isActiveDrop
            ? 'border-primary-300 bg-primary-50/80 shadow-[0_18px_42px_rgba(86,80,207,0.18)]'
            : 'border-white/70 bg-white/75 shadow-sm'
        }`}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-gray-900">{title}</h2>
            <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
          </div>
          <span className="rounded-full bg-gray-900 px-2.5 py-1 text-xs font-bold text-white">{zoneStudents.length}명</span>
        </div>
        <div className="flex flex-1 flex-col gap-2">
          {zoneStudents.length > 0 ? (
            zoneStudents.map(renderStudentCard)
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/80 p-4 text-center text-sm text-gray-400">
              여기에 학생 카드를 끌어다 놓으세요
            </div>
          )}
        </div>
      </section>
    );
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="rounded-2xl bg-gradient-to-r from-primary-700 to-primary-500 p-6 text-white shadow-[0_18px_42px_rgba(86,80,207,0.2)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/20 p-2.5"><UsersRound className="h-6 w-6" /></div>
              <div>
                <h1 className="text-2xl font-bold">반별 모임</h1>
                <p className="mt-0.5 text-sm text-white/80">담임선생님별로 재적 학생을 드래그해서 반 편성을 조정합니다</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/attendance/roster">
                <Button variant="secondary" className="!border-white/30 !bg-white/20 !text-white hover:!bg-white/30">
                  <UserRoundCog className="h-4 w-4" />재적 관리
                </Button>
              </Link>
              <Link href="/attendance">
                <Button variant="secondary" className="!border-white/30 !bg-white/20 !text-white hover:!bg-white/30">
                  <ArrowLeft className="h-4 w-4" />출석 체크
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <Link href="/attendance/roster" className="rounded-xl px-4 py-3 text-sm font-semibold text-gray-500 hover:bg-white/70 hover:text-gray-900">
              재적 명단
            </Link>
            <Link href="/attendance/roster/classes" className="rounded-xl bg-primary-50 px-4 py-3 text-sm font-bold text-primary-700">
              반별 모임
            </Link>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={8} cols={3} />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="glass-panel rounded-2xl p-4">
                <p className="text-xs font-semibold text-gray-500">담임선생님</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{homeroomTeachers.length}명</p>
              </div>
              <div className="glass-panel rounded-2xl p-4">
                <p className="text-xs font-semibold text-gray-500">재적 학생</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{students.length}명</p>
              </div>
              <div className="glass-panel rounded-2xl p-4">
                <p className="text-xs font-semibold text-gray-500">미배정</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{unassignedStudents.length}명</p>
              </div>
            </div>

            {homeroomTeachers.length === 0 ? (
              <div className="glass-panel rounded-2xl p-8 text-center">
                <h2 className="text-lg font-bold text-gray-900">담임선생님이 아직 없습니다</h2>
                <p className="mt-2 text-sm text-gray-500">재적 관리에서 교사를 추가하거나, 기존 교사를 담임선생님으로 표시하면 반별 모임 칸이 생성됩니다.</p>
                <Link href="/attendance/roster" className="mt-4 inline-flex">
                  <Button>담임 등록하러 가기</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-4 xl:grid-cols-3">
                  {homeroomTeachers.map((teacher) => renderDropZone(
                    teacher.id,
                    `${teacher.name} 선생님`,
                    teacher.position || '담임선생님',
                    studentsByTeacher.get(teacher.id) || [],
                    teacher.id
                  ))}
                </div>

                {renderDropZone(
                  'unassigned',
                  '미배정 재적 학생',
                  '담임 반으로 배치할 학생을 여기서 끌어올리거나, 다시 내려놓으면 미배정 처리됩니다',
                  unassignedStudents,
                  null
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
