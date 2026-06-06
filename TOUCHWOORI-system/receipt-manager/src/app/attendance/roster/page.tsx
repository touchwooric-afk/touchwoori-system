'use client';

export const runtime = 'edge';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Pencil, Save, Trash2, UserRoundCog } from 'lucide-react';
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
  is_long_absent: boolean;
  homeroom_teacher_id: string;
  is_active: boolean;
  memo: string;
}

type StudentQuickStatus = 'enrolled' | 'newcomer' | 'long_absent';

interface TeacherQuickForm {
  name: string;
  grade: number;
  is_homeroom: boolean;
  position: string;
  memo: string;
}

interface StudentQuickForm {
  name: string;
  grade: number;
  homeroom_teacher_id: string;
  status: StudentQuickStatus;
  memo: string;
}

const GRADE_STYLES: Record<number, string> = {
  1: 'bg-amber-50 text-amber-700',
  2: 'bg-blue-50 text-blue-700',
  3: 'bg-purple-50 text-purple-700',
};

const EMPTY_FORM: MemberForm = {
  member_type: 'student',
  name: '',
  grade: 1,
  position: '',
  is_homeroom: false,
  student_kind: 'enrolled',
  is_long_absent: false,
  homeroom_teacher_id: '',
  is_active: true,
  memo: '',
};

const EMPTY_TEACHER_QUICK_FORM: TeacherQuickForm = {
  name: '',
  grade: 0,
  is_homeroom: false,
  position: '',
  memo: '',
};

const EMPTY_STUDENT_QUICK_FORM: StudentQuickForm = {
  name: '',
  grade: 1,
  homeroom_teacher_id: '',
  status: 'enrolled',
  memo: '',
};

const QUICK_FIELD_CLASS = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100';

export default function AttendanceRosterPage() {
  const { activeDept } = useActiveDept();
  const toast = useToast();
  const [members, setMembers] = useState<AttendanceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MemberForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [teacherRows, setTeacherRows] = useState<TeacherQuickForm[]>([{ ...EMPTY_TEACHER_QUICK_FORM }]);
  const [studentRows, setStudentRows] = useState<StudentQuickForm[]>([{ ...EMPTY_STUDENT_QUICK_FORM }]);
  const [quickSubmitting, setQuickSubmitting] = useState<AttendanceMemberType | null>(null);
  const teacherTableRef = useRef<HTMLTableElement>(null);
  const studentTableRef = useRef<HTMLTableElement>(null);

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

  const openEdit = (member: AttendanceMember) => {
    setEditingId(member.id);
    setForm({
      member_type: member.member_type,
      name: member.name,
      grade: member.grade || (member.member_type === 'student' ? 1 : 0),
      position: member.position || '',
      is_homeroom: member.is_homeroom,
      student_kind: member.student_kind || 'enrolled',
      is_long_absent: member.is_long_absent,
      homeroom_teacher_id: member.homeroom_teacher_id || '',
      is_active: member.is_active,
      memo: member.memo || '',
    });
    setModalOpen(true);
  };

  const updateTeacherRow = <K extends keyof TeacherQuickForm>(
    index: number,
    field: K,
    value: TeacherQuickForm[K]
  ) => {
    setTeacherRows((current) => current.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [field]: value } : row
    )));
  };

  const updateStudentRow = <K extends keyof StudentQuickForm>(
    index: number,
    field: K,
    value: StudentQuickForm[K]
  ) => {
    setStudentRows((current) => current.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [field]: value } : row
    )));
  };

  const addQuickRow = (memberType: AttendanceMemberType) => {
    if (memberType === 'teacher') {
      setTeacherRows((current) => {
        const previous = current[current.length - 1];
        return [...current, {
          ...EMPTY_TEACHER_QUICK_FORM,
          grade: previous.is_homeroom ? previous.grade : 0,
          is_homeroom: previous.is_homeroom,
          position: previous.position,
        }];
      });
    } else {
      setStudentRows((current) => {
        const previous = current[current.length - 1];
        return [...current, {
          ...EMPTY_STUDENT_QUICK_FORM,
          grade: previous.grade,
          homeroom_teacher_id: previous.homeroom_teacher_id,
          status: previous.status,
        }];
      });
    }

    setTimeout(() => {
      const table = memberType === 'teacher' ? teacherTableRef.current : studentTableRef.current;
      const rows = table?.querySelectorAll('tbody tr');
      const firstInput = rows?.[rows.length - 1]?.querySelector('input, select') as HTMLElement | undefined;
      firstInput?.focus();
    }, 50);
  };

  const removeQuickRow = (memberType: AttendanceMemberType, index: number) => {
    if (memberType === 'teacher') {
      setTeacherRows((current) => current.length === 1
        ? [{ ...EMPTY_TEACHER_QUICK_FORM }]
        : current.filter((_, rowIndex) => rowIndex !== index));
    } else {
      setStudentRows((current) => current.length === 1
        ? [{ ...EMPTY_STUDENT_QUICK_FORM }]
        : current.filter((_, rowIndex) => rowIndex !== index));
    }
  };

  const handleQuickKeyDown = (
    event: React.KeyboardEvent,
    memberType: AttendanceMemberType,
    index: number,
    field: 'name' | 'memo'
  ) => {
    const rows = memberType === 'teacher' ? teacherRows : studentRows;
    const isLastRow = index === rows.length - 1;
    const shouldAdd = isLastRow && (
      (event.key === 'Tab' && !event.shiftKey && field === 'memo')
      || (event.key === 'Enter' && field === 'memo')
    );
    if (!shouldAdd) return;
    event.preventDefault();
    addQuickRow(memberType);
  };

  const saveQuickMembers = async (memberType: AttendanceMemberType) => {
    const rows = memberType === 'teacher' ? teacherRows : studentRows;
    const validRows = rows.filter((row) => row.name.trim());
    if (!validRows.length) {
      toast.error('저장할 이름을 입력해주세요');
      return;
    }

    setQuickSubmitting(memberType);
    try {
      const payload = memberType === 'teacher'
        ? teacherRows.filter((row) => row.name.trim()).map((row) => ({
            member_type: 'teacher',
            ...row,
            grade: row.is_homeroom ? row.grade || null : null,
            is_active: true,
          }))
        : studentRows.filter((row) => row.name.trim()).map((row) => ({
            member_type: 'student',
            name: row.name,
            grade: row.grade,
            homeroom_teacher_id: row.homeroom_teacher_id,
            student_kind: row.status === 'newcomer' ? 'newcomer' : 'enrolled',
            is_long_absent: row.status === 'long_absent',
            memo: row.memo,
            is_active: true,
          }));
      const res = await fetch('/api/attendance/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department_id: activeDept, members: payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      toast.success(`${memberType === 'teacher' ? '교사' : '학생'} ${validRows.length}명을 등록했습니다`);
      if (memberType === 'teacher') {
        setTeacherRows([{ ...EMPTY_TEACHER_QUICK_FORM }]);
      } else {
        setStudentRows([{ ...EMPTY_STUDENT_QUICK_FORM }]);
      }
      await loadMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '명단 등록에 실패했습니다');
    } finally {
      setQuickSubmitting(null);
    }
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
  const selectableTeachers = teachers.filter((member) => member.is_active && member.is_homeroom);
  const students = members.filter((member) => member.member_type === 'student')
    .sort((a, b) =>
      Number(a.is_long_absent) - Number(b.is_long_absent)
      || (a.grade || 0) - (b.grade || 0)
      || a.name.localeCompare(b.name, 'ko'));

  const removeTeacher = async () => {
    if (!editingId || form.member_type !== 'teacher') return;
    if (!window.confirm(`${form.name} 선생님을 담임/교사 명단에서 삭제할까요?\n과거 출석 기록은 유지됩니다.`)) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/attendance/roster', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, department_id: activeDept }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success('교사를 삭제했습니다. 과거 출석 기록은 유지됩니다');
      setModalOpen(false);
      await loadMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '교사 삭제에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  const renderMember = (member: AttendanceMember) => (
    <div key={member.id} className={`flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 last:border-0 ${!member.is_active ? 'opacity-50' : ''}`}>
      <div>
        <p className="text-sm font-semibold text-gray-900">
          {member.name}
          {member.student_kind === 'newcomer' && <span className="ml-2 rounded-full bg-info-50 px-2 py-0.5 text-xs text-info-600">새친구</span>}
          {member.is_homeroom && <span className="ml-2 rounded-full bg-primary-50 px-2 py-0.5 text-xs text-primary-700">담임</span>}
          {member.is_long_absent && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">장결</span>}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {member.member_type === 'teacher' ? (
            <>
              {member.grade ? `${member.grade}학년` : '학년 없음'}
              {' · '}
              {member.position || '교사'}
            </>
          ) : (
            <>
              <span className={`rounded-full px-2 py-0.5 font-semibold ${GRADE_STYLES[member.grade || 1]}`}>{member.grade}학년</span>
              {member.homeroom_teacher?.name ? ` · 담임 ${member.homeroom_teacher.name}` : ''}
            </>
          )}
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
                <h1 className="text-2xl font-bold">재적 관리</h1>
                <p className="mt-0.5 text-sm text-white/80">학생 재적, 장결 상태와 담임선생님을 관리합니다</p>
              </div>
            </div>
            <Link href="/attendance">
              <Button variant="secondary" className="!border-white/30 !bg-white/20 !text-white hover:!bg-white/30">
                <ArrowLeft className="h-4 w-4" />출석 체크
              </Button>
            </Link>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <Link href="/attendance/roster" className="rounded-xl bg-primary-50 px-4 py-3 text-sm font-bold text-primary-700">
              재적 명단
            </Link>
            <Link href="/attendance/roster/classes" className="rounded-xl px-4 py-3 text-sm font-semibold text-gray-500 hover:bg-white/70 hover:text-gray-900">
              반별 모임
            </Link>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={8} cols={3} />
        ) : (
          <div className="space-y-5">
            <section className="glass-panel overflow-hidden rounded-2xl">
              <div className="flex items-center justify-between border-b border-white/70 px-4 py-4">
                <div>
                  <h2 className="font-bold text-gray-900">교사 명단</h2>
                  <p className="text-xs text-gray-500">{teachers.length}명 등록 · 메모에서 Tab을 누르면 새 행 추가</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => saveQuickMembers('teacher')}
                  loading={quickSubmitting === 'teacher'}
                  disabled={quickSubmitting !== null || !teacherRows.some((row) => row.name.trim())}
                >
                  <Save className="h-4 w-4" />전체 저장
                </Button>
              </div>
              <div className="overflow-x-auto border-b border-gray-100 bg-primary-50/40 px-4 py-4">
                <table ref={teacherTableRef} className="min-w-[900px] w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-gray-500">
                      <th className="px-1 pb-1.5">이름</th><th className="px-1 pb-1.5 w-[120px]">담임</th>
                      <th className="px-1 pb-1.5 w-[120px]">학년</th><th className="px-1 pb-1.5">직분</th>
                      <th className="px-1 pb-1.5">메모</th><th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {teacherRows.map((row, index) => (
                      <tr key={index}>
                        <td className="p-1"><input value={row.name} onChange={(event) => updateTeacherRow(index, 'name', event.target.value)} onKeyDown={(event) => handleQuickKeyDown(event, 'teacher', index, 'name')} placeholder="교사 이름" className={QUICK_FIELD_CLASS} /></td>
                        <td className="p-1"><select value={row.is_homeroom ? 'homeroom' : 'none'} onChange={(event) => {
                          const isHomeroom = event.target.value === 'homeroom';
                          setTeacherRows((current) => current.map((item, rowIndex) => rowIndex === index
                            ? { ...item, is_homeroom: isHomeroom, grade: isHomeroom ? item.grade || 1 : 0 }
                            : item));
                        }} className={QUICK_FIELD_CLASS}><option value="none">없음</option><option value="homeroom">담임</option></select></td>
                        <td className="p-1">{row.is_homeroom ? <select value={row.grade || 1} onChange={(event) => updateTeacherRow(index, 'grade', Number(event.target.value))} className={QUICK_FIELD_CLASS}><option value={1}>1학년</option><option value={2}>2학년</option><option value={3}>3학년</option></select> : <span className="block px-3 py-2 text-sm text-gray-400">-</span>}</td>
                        <td className="p-1"><input value={row.position} onChange={(event) => updateTeacherRow(index, 'position', event.target.value)} placeholder="교사, 부장교사" className={QUICK_FIELD_CLASS} /></td>
                        <td className="p-1"><input value={row.memo} onChange={(event) => updateTeacherRow(index, 'memo', event.target.value)} onKeyDown={(event) => handleQuickKeyDown(event, 'teacher', index, 'memo')} placeholder="메모" className={QUICK_FIELD_CLASS} /></td>
                        <td className="p-1 text-center"><button type="button" onClick={() => removeQuickRow('teacher', index)} className="rounded p-2 text-gray-400 hover:bg-danger-50 hover:text-danger-600" aria-label="교사 입력 행 삭제"><Trash2 className="h-4 w-4" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button type="button" onClick={() => addQuickRow('teacher')} className="mt-2 w-full min-w-[900px] rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:border-primary-400 hover:text-primary-600">+ 교사 입력 행 추가</button>
              </div>
              <div>{teachers.map(renderMember)}</div>
            </section>
            <section className="glass-panel overflow-hidden rounded-2xl">
              <div className="flex items-center justify-between border-b border-white/70 px-4 py-4">
                <div>
                  <h2 className="font-bold text-gray-900">학생 명단</h2>
                  <p className="text-xs text-gray-500">{students.length}명 등록 · 메모에서 Tab을 누르면 새 행 추가</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => saveQuickMembers('student')}
                  loading={quickSubmitting === 'student'}
                  disabled={quickSubmitting !== null || !studentRows.some((row) => row.name.trim())}
                >
                  <Save className="h-4 w-4" />전체 저장
                </Button>
              </div>
              <div className="overflow-x-auto border-b border-gray-100 bg-primary-50/40 px-4 py-4">
                <table ref={studentTableRef} className="min-w-[960px] w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-gray-500">
                      <th className="px-1 pb-1.5">이름</th><th className="px-1 pb-1.5 w-[120px]">학년</th>
                      <th className="px-1 pb-1.5">담임</th><th className="px-1 pb-1.5 w-[150px]">구분</th>
                      <th className="px-1 pb-1.5">메모</th><th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {studentRows.map((row, index) => (
                      <tr key={index}>
                        <td className="p-1"><input value={row.name} onChange={(event) => updateStudentRow(index, 'name', event.target.value)} onKeyDown={(event) => handleQuickKeyDown(event, 'student', index, 'name')} placeholder="학생 이름" className={QUICK_FIELD_CLASS} /></td>
                        <td className="p-1"><select value={row.grade} onChange={(event) => updateStudentRow(index, 'grade', Number(event.target.value))} className={QUICK_FIELD_CLASS}><option value={1}>1학년</option><option value={2}>2학년</option><option value={3}>3학년</option></select></td>
                        <td className="p-1"><select value={row.homeroom_teacher_id} onChange={(event) => updateStudentRow(index, 'homeroom_teacher_id', event.target.value)} className={QUICK_FIELD_CLASS}><option value="">담임 없음</option>{selectableTeachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}{teacher.is_homeroom ? ' (담임)' : ''}</option>)}</select></td>
                        <td className="p-1"><select value={row.status} onChange={(event) => updateStudentRow(index, 'status', event.target.value as StudentQuickStatus)} className={QUICK_FIELD_CLASS}><option value="enrolled">재적 학생</option><option value="newcomer">새친구</option><option value="long_absent">장결자</option></select></td>
                        <td className="p-1"><input value={row.memo} onChange={(event) => updateStudentRow(index, 'memo', event.target.value)} onKeyDown={(event) => handleQuickKeyDown(event, 'student', index, 'memo')} placeholder="메모" className={QUICK_FIELD_CLASS} /></td>
                        <td className="p-1 text-center"><button type="button" onClick={() => removeQuickRow('student', index)} className="rounded p-2 text-gray-400 hover:bg-danger-50 hover:text-danger-600" aria-label="학생 입력 행 삭제"><Trash2 className="h-4 w-4" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button type="button" onClick={() => addQuickRow('student')} className="mt-2 w-full min-w-[960px] rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:border-primary-400 hover:text-primary-600">+ 학생 입력 행 추가</button>
              </div>
              <div>{students.map(renderMember)}</div>
            </section>
          </div>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? '재적 정보 수정' : '재적 등록'}>
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
            <>
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
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">담임선생님</label>
                <select
                  value={form.homeroom_teacher_id}
                  onChange={(event) => setForm((current) => ({ ...current, homeroom_teacher_id: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">담임 미지정</option>
                  {selectableTeachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>{teacher.name}{teacher.is_homeroom ? ' (담임)' : ''}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_long_absent}
                  onChange={(event) => setForm((current) => ({ ...current, is_long_absent: event.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600"
                />
                장결자로 등록 (새 출석 회차에서 자동 결석)
              </label>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">담임</label>
                  <select
                    value={form.is_homeroom ? 'homeroom' : 'none'}
                    onChange={(event) => {
                      const isHomeroom = event.target.value === 'homeroom';
                      setForm((current) => ({
                        ...current,
                        is_homeroom: isHomeroom,
                        grade: isHomeroom ? current.grade || 1 : 0,
                      }));
                    }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="none">없음</option>
                    <option value="homeroom">담임</option>
                  </select>
                </div>
                {form.is_homeroom && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">학년</label>
                    <select
                      value={form.grade || 1}
                      onChange={(event) => setForm((current) => ({ ...current, grade: Number(event.target.value) }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value={1}>1학년</option>
                      <option value={2}>2학년</option>
                      <option value={3}>3학년</option>
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">직분</label>
                <input
                  value={form.position}
                  onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))}
                  placeholder="교사, 총무교사, 부장교사"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </>
          )}

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
            {form.member_type === 'student' ? '현재 재적에 포함' : '현재 교사 명단에 표시'}
          </label>
          <div className="flex justify-between gap-2">
            {editingId && form.member_type === 'teacher' ? (
              <Button type="button" variant="secondary" onClick={removeTeacher} disabled={submitting}>
                <Trash2 className="h-4 w-4" />교사 삭제
              </Button>
            ) : <span />}
            <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>취소</Button>
            <Button type="submit" loading={submitting}>저장</Button>
            </div>
          </div>
        </form>
      </Modal>

    </AppShell>
  );
}
