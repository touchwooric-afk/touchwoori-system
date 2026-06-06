'use client';

export const runtime = 'edge';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ClipboardPaste, Pencil, Save, Trash2, UserRoundCog } from 'lucide-react';
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

interface BulkStudentRow {
  line: number;
  name: string;
  grade: number;
  homeroomTeacherId: string;
  homeroomTeacherName: string;
  studentKind: AttendanceStudentKind;
  isLongAbsent: boolean;
  memo: string;
  error: string | null;
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
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkGrade, setBulkGrade] = useState(1);
  const [bulkTeacherId, setBulkTeacherId] = useState('');
  const [bulkStudentKind, setBulkStudentKind] = useState<AttendanceStudentKind>('enrolled');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [teacherQuickForm, setTeacherQuickForm] = useState<TeacherQuickForm>(EMPTY_TEACHER_QUICK_FORM);
  const [studentQuickForm, setStudentQuickForm] = useState<StudentQuickForm>(EMPTY_STUDENT_QUICK_FORM);
  const [quickSubmitting, setQuickSubmitting] = useState<AttendanceMemberType | null>(null);
  const teacherNameRef = useRef<HTMLInputElement>(null);
  const studentNameRef = useRef<HTMLInputElement>(null);

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

  const saveQuickMember = async (event: React.FormEvent, memberType: AttendanceMemberType) => {
    event.preventDefault();
    const quickForm = memberType === 'teacher' ? teacherQuickForm : studentQuickForm;
    if (!quickForm.name.trim()) {
      toast.error('이름을 입력해주세요');
      return;
    }

    setQuickSubmitting(memberType);
    try {
      const studentStatus = memberType === 'student' ? studentQuickForm.status : null;
      const payload = memberType === 'teacher'
        ? {
            member_type: 'teacher',
            ...teacherQuickForm,
            grade: teacherQuickForm.grade || null,
            is_active: true,
          }
        : {
            member_type: 'student',
            name: studentQuickForm.name,
            grade: studentQuickForm.grade,
            homeroom_teacher_id: studentQuickForm.homeroom_teacher_id,
            student_kind: studentStatus === 'newcomer' ? 'newcomer' : 'enrolled',
            is_long_absent: studentStatus === 'long_absent',
            memo: studentQuickForm.memo,
            is_active: true,
          };
      const res = await fetch('/api/attendance/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department_id: activeDept, ...payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      toast.success(`${quickForm.name.trim()} ${memberType === 'teacher' ? '교사' : '학생'}을 등록했습니다`);
      if (memberType === 'teacher') {
        setTeacherQuickForm(EMPTY_TEACHER_QUICK_FORM);
      } else {
        setStudentQuickForm((current) => ({
          ...EMPTY_STUDENT_QUICK_FORM,
          grade: current.grade,
          homeroom_teacher_id: current.homeroom_teacher_id,
          status: current.status,
        }));
      }
      await loadMembers();
      requestAnimationFrame(() => {
        (memberType === 'teacher' ? teacherNameRef : studentNameRef).current?.focus();
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '등록에 실패했습니다');
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
  const selectableTeachers = teachers.filter((member) => member.is_active);
  const students = members.filter((member) => member.member_type === 'student')
    .sort((a, b) =>
      Number(a.is_long_absent) - Number(b.is_long_absent)
      || (a.grade || 0) - (b.grade || 0)
      || a.name.localeCompare(b.name, 'ko'));

  const bulkRows = useMemo<BulkStudentRow[]>(() => {
    const existingKeys = new Set(
      members
        .filter((member) => member.member_type === 'student' && member.is_active)
        .map((member) => `${member.name.trim()}::${member.grade}`)
    );
    const seenKeys = new Set<string>();
    const defaultTeacher = selectableTeachers.find((teacher) => teacher.id === bulkTeacherId);

    return bulkText
      .split(/\r?\n/)
      .map((raw, index) => ({ raw: raw.trim(), line: index + 1 }))
      .filter(({ raw }) => raw)
      .filter(({ raw }, index) => {
        if (index !== 0) return true;
        const firstColumn = raw.split(raw.includes('\t') ? '\t' : ',')[0].trim().toLowerCase();
        return firstColumn !== '이름' && firstColumn !== 'name';
      })
      .map(({ raw, line }) => {
        const separator = raw.includes('\t') ? '\t' : ',';
        const columns = raw.split(separator).map((value) => value.trim());
        const name = columns[0] || '';
        const gradeRaw = columns[1] || '';
        const teacherRaw = columns[2] || '';
        const kindRaw = (columns[3] || '').toLowerCase();
        const longAbsentRaw = (columns[4] || '').toLowerCase();
        const memo = columns.slice(5).join(separator).trim();

        const gradeMatch = gradeRaw.match(/[1-3]/);
        const grade = gradeRaw ? Number(gradeMatch?.[0] || 0) : bulkGrade;
        const teacher = teacherRaw
          ? selectableTeachers.find((item) => (
              item.name.trim() === teacherRaw.replace(/\s*선생님$/, '').trim()
            ))
          : defaultTeacher;

        let studentKind = bulkStudentKind;
        let kindError = false;
        if (kindRaw) {
          if (kindRaw.includes('새') || kindRaw === 'newcomer') studentKind = 'newcomer';
          else if (kindRaw.includes('재적') || kindRaw === 'enrolled') studentKind = 'enrolled';
          else kindError = true;
        }

        const isLongAbsent = ['장결', 'y', 'yes', 'true', '1', '예'].includes(longAbsentRaw);
        const key = `${name}::${grade}`;
        let error: string | null = null;
        if (!name) error = '이름을 입력해주세요';
        else if (name.length > 50) error = '이름은 50자 이하로 입력해주세요';
        else if (![1, 2, 3].includes(grade)) error = '학년은 1~3만 가능합니다';
        else if (teacherRaw && !teacher) error = `담임 '${teacherRaw}'을 찾을 수 없습니다`;
        else if (kindError) error = '구분은 재적 또는 새친구로 입력해주세요';
        else if (memo.length > 300) error = '메모는 300자 이하로 입력해주세요';
        else if (existingKeys.has(key)) error = '이미 재적 명단에 있습니다';
        else if (seenKeys.has(key)) error = '입력 목록에 중복되어 있습니다';
        seenKeys.add(key);

        return {
          line,
          name,
          grade,
          homeroomTeacherId: teacher?.id || '',
          homeroomTeacherName: teacher?.name || '',
          studentKind,
          isLongAbsent,
          memo,
          error,
        };
      });
  }, [bulkGrade, bulkStudentKind, bulkTeacherId, bulkText, members, selectableTeachers]);

  const bulkErrorCount = bulkRows.filter((row) => row.error).length;

  const closeBulkModal = () => {
    if (bulkSubmitting) return;
    setBulkOpen(false);
    setBulkText('');
  };

  const saveBulkStudents = async () => {
    if (!activeDept || bulkRows.length === 0 || bulkErrorCount > 0) return;
    setBulkSubmitting(true);
    try {
      const res = await fetch('/api/attendance/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department_id: activeDept,
          members: bulkRows.map((row) => ({
            member_type: 'student',
            name: row.name,
            grade: row.grade,
            student_kind: row.studentKind,
            is_long_absent: row.isLongAbsent,
            homeroom_teacher_id: row.homeroomTeacherId,
            is_active: true,
            memo: row.memo,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(`학생 ${json.count || bulkRows.length}명을 일괄 등록했습니다`);
      setBulkOpen(false);
      setBulkText('');
      await loadMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '학생 일괄 등록에 실패했습니다');
    } finally {
      setBulkSubmitting(false);
    }
  };

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
                  <p className="text-xs text-gray-500">{teachers.length}명 등록 · Tab으로 이동하고 Enter로 저장</p>
                </div>
              </div>
              <div className="overflow-x-auto border-b border-gray-100 bg-primary-50/40 px-4 py-4">
                <div className="min-w-[900px]">
                  <div className="mb-1.5 grid grid-cols-[1.1fr_120px_120px_1fr_1.4fr_92px] gap-2 px-1 text-xs font-semibold text-gray-500">
                    <span>이름</span><span>학년</span><span>담임</span><span>직분</span><span>메모</span><span />
                  </div>
                  <form
                    onSubmit={(event) => saveQuickMember(event, 'teacher')}
                    className="grid grid-cols-[1.1fr_120px_120px_1fr_1.4fr_92px] gap-2"
                  >
                    <input
                      ref={teacherNameRef}
                      required
                      value={teacherQuickForm.name}
                      onChange={(event) => setTeacherQuickForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="교사 이름"
                      className={QUICK_FIELD_CLASS}
                    />
                    <select
                      value={teacherQuickForm.grade}
                      onChange={(event) => setTeacherQuickForm((current) => ({ ...current, grade: Number(event.target.value) }))}
                      className={QUICK_FIELD_CLASS}
                    >
                      <option value={0}>학년 없음</option>
                      <option value={1}>1학년</option>
                      <option value={2}>2학년</option>
                      <option value={3}>3학년</option>
                    </select>
                    <select
                      value={teacherQuickForm.is_homeroom ? 'homeroom' : 'none'}
                      onChange={(event) => setTeacherQuickForm((current) => ({ ...current, is_homeroom: event.target.value === 'homeroom' }))}
                      className={QUICK_FIELD_CLASS}
                    >
                      <option value="none">없음</option>
                      <option value="homeroom">담임</option>
                    </select>
                    <input
                      value={teacherQuickForm.position}
                      onChange={(event) => setTeacherQuickForm((current) => ({ ...current, position: event.target.value }))}
                      placeholder="교사, 부장교사"
                      className={QUICK_FIELD_CLASS}
                    />
                    <input
                      value={teacherQuickForm.memo}
                      onChange={(event) => setTeacherQuickForm((current) => ({ ...current, memo: event.target.value }))}
                      placeholder="메모"
                      className={QUICK_FIELD_CLASS}
                    />
                    <Button type="submit" size="sm" loading={quickSubmitting === 'teacher'} disabled={quickSubmitting !== null}>
                      <Save className="h-4 w-4" />저장
                    </Button>
                  </form>
                </div>
              </div>
              <div>{teachers.map(renderMember)}</div>
            </section>
            <section className="glass-panel overflow-hidden rounded-2xl">
              <div className="flex items-center justify-between border-b border-white/70 px-4 py-4">
                <div>
                  <h2 className="font-bold text-gray-900">학생 명단</h2>
                  <p className="text-xs text-gray-500">{students.length}명 등록 · Tab으로 이동하고 Enter로 저장</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setBulkOpen(true)}>
                    <ClipboardPaste className="h-4 w-4" />일괄 등록
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto border-b border-gray-100 bg-primary-50/40 px-4 py-4">
                <div className="min-w-[960px]">
                  <div className="mb-1.5 grid grid-cols-[1.1fr_120px_1fr_150px_1.4fr_92px] gap-2 px-1 text-xs font-semibold text-gray-500">
                    <span>이름</span><span>학년</span><span>담임</span><span>구분</span><span>메모</span><span />
                  </div>
                  <form
                    onSubmit={(event) => saveQuickMember(event, 'student')}
                    className="grid grid-cols-[1.1fr_120px_1fr_150px_1.4fr_92px] gap-2"
                  >
                    <input
                      ref={studentNameRef}
                      required
                      value={studentQuickForm.name}
                      onChange={(event) => setStudentQuickForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="학생 이름"
                      className={QUICK_FIELD_CLASS}
                    />
                    <select
                      value={studentQuickForm.grade}
                      onChange={(event) => setStudentQuickForm((current) => ({ ...current, grade: Number(event.target.value) }))}
                      className={QUICK_FIELD_CLASS}
                    >
                      <option value={1}>1학년</option>
                      <option value={2}>2학년</option>
                      <option value={3}>3학년</option>
                    </select>
                    <select
                      value={studentQuickForm.homeroom_teacher_id}
                      onChange={(event) => setStudentQuickForm((current) => ({ ...current, homeroom_teacher_id: event.target.value }))}
                      className={QUICK_FIELD_CLASS}
                    >
                      <option value="">담임 없음</option>
                      {selectableTeachers.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>{teacher.name}{teacher.is_homeroom ? ' (담임)' : ''}</option>
                      ))}
                    </select>
                    <select
                      value={studentQuickForm.status}
                      onChange={(event) => setStudentQuickForm((current) => ({ ...current, status: event.target.value as StudentQuickStatus }))}
                      className={QUICK_FIELD_CLASS}
                    >
                      <option value="enrolled">재적 학생</option>
                      <option value="newcomer">새친구</option>
                      <option value="long_absent">장결자</option>
                    </select>
                    <input
                      value={studentQuickForm.memo}
                      onChange={(event) => setStudentQuickForm((current) => ({ ...current, memo: event.target.value }))}
                      placeholder="메모"
                      className={QUICK_FIELD_CLASS}
                    />
                    <Button type="submit" size="sm" loading={quickSubmitting === 'student'} disabled={quickSubmitting !== null}>
                      <Save className="h-4 w-4" />저장
                    </Button>
                  </form>
                </div>
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
                  <label className="mb-1 block text-sm font-medium text-gray-700">학년</label>
                  <select
                    value={form.grade}
                    onChange={(event) => setForm((current) => ({ ...current, grade: Number(event.target.value) }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value={0}>학년 없음</option>
                    <option value={1}>1학년</option>
                    <option value={2}>2학년</option>
                    <option value={3}>3학년</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">담임</label>
                  <select
                    value={form.is_homeroom ? 'homeroom' : 'none'}
                    onChange={(event) => setForm((current) => ({ ...current, is_homeroom: event.target.value === 'homeroom' }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="none">없음</option>
                    <option value="homeroom">담임</option>
                  </select>
                </div>
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

      <Modal
        isOpen={bulkOpen}
        onClose={closeBulkModal}
        title="학생 일괄 등록"
        size="xl"
        preventClose={Boolean(bulkText) && !bulkSubmitting}
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-primary-100 bg-primary-50/70 p-4 text-sm text-gray-700">
            <p className="font-semibold text-primary-800">빠른 입력</p>
            <p className="mt-1">학생 이름을 한 줄에 한 명씩 붙여넣으면 아래 공통 설정이 적용됩니다.</p>
            <p className="mt-2 text-xs text-gray-500">
              엑셀 상세 입력: 이름 / 학년 / 담임 / 구분 / 장결 / 메모 순서의 셀을 복사해 붙여넣으세요.
              쉼표로 구분한 입력도 지원합니다.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">공통 학년</label>
              <select
                value={bulkGrade}
                onChange={(event) => setBulkGrade(Number(event.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value={1}>1학년</option>
                <option value={2}>2학년</option>
                <option value={3}>3학년</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">공통 담임</label>
              <select
                value={bulkTeacherId}
                onChange={(event) => setBulkTeacherId(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">담임 미지정</option>
                {selectableTeachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">공통 등록 구분</label>
              <select
                value={bulkStudentKind}
                onChange={(event) => setBulkStudentKind(event.target.value as AttendanceStudentKind)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="enrolled">재적 학생</option>
                <option value="newcomer">새친구</option>
              </select>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <label className="block text-sm font-medium text-gray-700">학생 명단 붙여넣기</label>
              <span className="text-xs text-gray-500">최대 200명</span>
            </div>
            <textarea
              value={bulkText}
              onChange={(event) => setBulkText(event.target.value)}
              rows={8}
              placeholder={'김민준\n이서연\n박지후\n\n또는\n김민준\t1\t홍길동\t재적\t\t축구부'}
              className="w-full rounded-xl border border-gray-300 px-3 py-3 font-mono text-sm leading-6 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
          </div>

          {bulkRows.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-sm font-semibold text-gray-800">등록 미리보기</p>
                <div className="flex gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-success-50 px-2.5 py-1 text-success-700">
                    등록 가능 {bulkRows.length - bulkErrorCount}명
                  </span>
                  {bulkErrorCount > 0 && (
                    <span className="rounded-full bg-danger-50 px-2.5 py-1 text-danger-700">
                      확인 필요 {bulkErrorCount}명
                    </span>
                  )}
                </div>
              </div>
              <div className="max-h-72 overflow-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="sticky top-0 bg-white text-gray-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">행</th>
                      <th className="px-3 py-2 font-medium">이름</th>
                      <th className="px-3 py-2 font-medium">학년</th>
                      <th className="px-3 py-2 font-medium">담임</th>
                      <th className="px-3 py-2 font-medium">구분</th>
                      <th className="px-3 py-2 font-medium">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {bulkRows.map((row) => (
                      <tr key={`${row.line}-${row.name}`} className={row.error ? 'bg-danger-50/60' : 'bg-white'}>
                        <td className="px-3 py-2 text-gray-400">{row.line}</td>
                        <td className="px-3 py-2 font-semibold text-gray-900">{row.name || '-'}</td>
                        <td className="px-3 py-2 text-gray-600">{row.grade || '-'}학년</td>
                        <td className="px-3 py-2 text-gray-600">{row.homeroomTeacherName || '미지정'}</td>
                        <td className="px-3 py-2 text-gray-600">{row.studentKind === 'newcomer' ? '새친구' : '재적'}</td>
                        <td className={`px-3 py-2 ${row.error ? 'font-medium text-danger-700' : 'text-success-700'}`}>
                          {row.error || (row.isLongAbsent ? '등록 가능 · 장결' : '등록 가능')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-500">
              오류가 있는 행은 수정한 뒤 등록할 수 있습니다. 저장은 전체 명단에 한 번에 적용됩니다.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={closeBulkModal} disabled={bulkSubmitting}>취소</Button>
              <Button
                type="button"
                onClick={saveBulkStudents}
                loading={bulkSubmitting}
                disabled={bulkRows.length === 0 || bulkRows.length > 200 || bulkErrorCount > 0}
              >
                학생 {bulkRows.length}명 등록
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
