'use client';

export const runtime = 'edge';


import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';
import { useUser } from '@/hooks/useUser';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';
import { TableSkeleton } from '@/components/ui/Skeleton';
import Pagination from '@/components/ui/Pagination';
import { formatRole, formatDate } from '@/lib/format';
import { Users, UserCheck, UserX, Shield, Eye, Trash2, Settings } from 'lucide-react';
import type { User, UserStatus, Role } from '@/types';

type TabFilter = 'all' | UserStatus;

const TABS: { key: TabFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '대기중' },
  { key: 'active', label: '활성' },
  { key: 'inactive', label: '비활성' },
];

const PAGE_SIZE = 10;

export default function UsersPage() {
  const toast = useToast();
  const { user: currentUser } = useUser();
  const isMaster = currentUser?.role === 'master';
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Approve modal
  const [approveModal, setApproveModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role>('teacher');
  const [selectedPosition, setSelectedPosition] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit role modal
  const [editModal, setEditModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editRole, setEditRole] = useState<Role>('teacher');
  const [editDepartment, setEditDepartment] = useState('');
  const [editPosition, setEditPosition] = useState('');

  // Delete confirm
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; user: User | null }>({ open: false, user: null });

  // Confirm dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    user: User | null;
    action: 'deactivate' | 'reactivate';
  }>({ open: false, user: null, action: 'deactivate' });

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(PAGE_SIZE),
      });
      if (activeTab !== 'all') {
        params.set('status', activeTab);
      }
      const res = await fetch(`/api/users?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setUsers(json.data);
      setTotalItems(json.total);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '사용자 목록을 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, [activeTab, currentPage, toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  const handleApproveOpen = (user: User) => {
    setSelectedUser(user);
    setSelectedRole('teacher');
    setSelectedPosition(user.position || '');
    setApproveModal(true);
  };

  const handleApproveSubmit = async () => {
    if (!selectedUser) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedUser.id, role: selectedRole, status: 'active', position: selectedPosition }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(`${selectedUser.name}님이 승인되었습니다`);
      setApproveModal(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '승인에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditOpen = (u: User) => {
    setEditUser(u);
    setEditRole(u.role || 'teacher');
    setEditDepartment(u.department_id || '고등부');
    setEditPosition(u.position || '');
    setEditModal(true);
  };

  const handleEditSubmit = async () => {
    if (!editUser) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editUser.id, role: editRole, department_id: editDepartment, position: editPosition }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(`${editUser.name}님의 정보가 변경되었습니다`);
      setEditModal(false);
      setEditUser(null);
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '변경에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    const u = deleteDialog.user;
    if (!u) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/users?id=${u.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(`${u.name}님의 계정이 삭제되었습니다`);
      setDeleteDialog({ open: false, user: null });
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '삭제에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async () => {
    const { user, action } = confirmDialog;
    if (!user) return;
    setSubmitting(true);
    try {
      const newStatus = action === 'deactivate' ? 'inactive' : 'active';
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, status: newStatus }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(
        action === 'deactivate'
          ? `${user.name}님이 비활성화되었습니다`
          : `${user.name}님이 재활성화되었습니다`
      );
      setConfirmDialog({ open: false, user: null, action: 'deactivate' });
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '상태 변경에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* 페이지 헤더 */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-500 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/20 p-2.5">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">사용자 관리</h1>
              <p className="text-sm text-white/80 mt-0.5">교사 계정 승인 및 관리</p>
            </div>
          </div>
        </div>

        {/* 탭 필터 */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200
                ${activeTab === tab.key
                  ? 'bg-white text-primary-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 테이블 */}
        {loading ? (
          <TableSkeleton rows={5} cols={7} />
        ) : users.length === 0 ? (
          activeTab === 'pending' ? (
            <EmptyState
              icon={UserCheck}
              title="신규 신청이 없습니다"
              description="새로운 가입 신청이 들어오면 여기에 표시됩니다"
            />
          ) : (
            <EmptyState
              icon={Users}
              title="사용자가 없습니다"
              description="해당 상태의 사용자가 없습니다"
            />
          )
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      이름
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      이메일
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">
                      직분
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      권한
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      상태
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                      신청일
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      액션
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                        {u.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {u.email}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap hidden md:table-cell">
                        {u.position || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {formatRole(u.role)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge status={u.status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap hidden lg:table-cell">
                        {formatDate(u.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {u.status === 'pending' && (
                            <Button size="sm" onClick={() => handleApproveOpen(u)}>
                              승인
                            </Button>
                          )}
                          {u.status === 'active' && (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleEditOpen(u)}
                                disabled={!isMaster && (u.role === 'master' || u.role === 'sub_master')}
                              >
                                <Settings className="h-3.5 w-3.5" />
                                변경
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                disabled={!isMaster && (u.role === 'master' || u.role === 'sub_master')}
                                onClick={() =>
                                  setConfirmDialog({ open: true, user: u, action: 'deactivate' })
                                }
                              >
                                비활성화
                              </Button>
                            </>
                          )}
                          {u.status === 'inactive' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                setConfirmDialog({ open: true, user: u, action: 'reactivate' })
                              }
                            >
                              재활성화
                            </Button>
                          )}
                          {isMaster && u.id !== currentUser?.id && (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => setDeleteDialog({ open: true, user: u })}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              totalItems={totalItems}
              pageSize={PAGE_SIZE}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </div>

      {/* 승인 모달 */}
      <Modal isOpen={approveModal} onClose={() => setApproveModal(false)} title="사용자 승인">
        {selectedUser && (
          <div className="space-y-5">
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">이름</span>
                <span className="text-sm font-medium text-gray-900">{selectedUser.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">이메일</span>
                <span className="text-sm font-medium text-gray-900">{selectedUser.email}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">직분</span>
                <input
                  type="text"
                  value={selectedPosition}
                  onChange={(e) => setSelectedPosition(e.target.value)}
                  placeholder="예: 목사, 전도사, 장로, 교사"
                  className="text-sm text-right rounded-lg border border-gray-300 px-2 py-1 w-44
                    focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                권한 선택 <span className="text-danger-600">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'teacher',    label: '교사',      icon: UserCheck, masterOnly: false },
                  { value: 'accountant', label: '회계 교사', icon: UserX,     masterOnly: false },
                  { value: 'auditor',    label: 'viewer', icon: Eye,      masterOnly: false },
                  { value: 'sub_master', label: 'submaster',  icon: Shield,   masterOnly: true  },
                ].filter((opt) => !opt.masterOnly || isMaster).map((opt) => (
                  <label
                    key={opt.value}
                    className={`
                      flex items-center justify-center gap-2 rounded-xl border-2 p-3 cursor-pointer transition-all
                      ${selectedRole === opt.value
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                      }
                    `}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={opt.value}
                      checked={selectedRole === opt.value}
                      onChange={() => setSelectedRole(opt.value as Role)}
                      className="sr-only"
                    />
                    <opt.icon className="h-4 w-4" />
                    <span className="text-sm font-medium">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="secondary" onClick={() => setApproveModal(false)} disabled={submitting}>
                취소
              </Button>
              <Button onClick={handleApproveSubmit} loading={submitting}>
                승인하기
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 권한/부서 변경 모달 */}
      <Modal isOpen={editModal} onClose={() => setEditModal(false)} title="권한 · 부서 · 직분 변경">
        {editUser && (
          <div className="space-y-5">
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">이름</span>
                <span className="text-sm font-medium text-gray-900">{editUser.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">이메일</span>
                <span className="text-sm font-medium text-gray-900">{editUser.email}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">권한</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'teacher',    label: '교사',      icon: UserCheck, masterOnly: false },
                  { value: 'accountant', label: '회계 교사', icon: UserX,     masterOnly: false },
                  { value: 'auditor',    label: 'viewer', icon: Eye,      masterOnly: false },
                  { value: 'sub_master', label: 'submaster',  icon: Shield,   masterOnly: true  },
                ].filter((opt) => !opt.masterOnly || isMaster).map((opt) => (
                  <label
                    key={opt.value}
                    className={`
                      flex items-center justify-center gap-2 rounded-xl border-2 p-3 cursor-pointer transition-all
                      ${editRole === opt.value
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                      }
                    `}
                  >
                    <input
                      type="radio"
                      name="editRole"
                      value={opt.value}
                      checked={editRole === opt.value}
                      onChange={() => setEditRole(opt.value as Role)}
                      className="sr-only"
                    />
                    <opt.icon className="h-4 w-4" />
                    <span className="text-sm font-medium">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">부서</label>
              <select
                value={editDepartment}
                onChange={(e) => setEditDepartment(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                  focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              >
                <option value="고등부">터치우리 고등부</option>
                <option value="중등부">드림우리 중등부</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">직분</label>
              <input
                type="text"
                value={editPosition}
                onChange={(e) => setEditPosition(e.target.value)}
                placeholder="예: 목사, 전도사, 장로, 교사"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                  focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="secondary" onClick={() => setEditModal(false)} disabled={submitting}>
                취소
              </Button>
              <Button onClick={handleEditSubmit} loading={submitting}>
                변경하기
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 삭제 확인 다이얼로그 */}
      <ConfirmDialog
        isOpen={deleteDialog.open}
        title="사용자 삭제"
        message={`${deleteDialog.user?.name}님의 계정을 완전히 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
        confirmText="삭제"
        variant="danger"
        loading={submitting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteDialog({ open: false, user: null })}
      />

      {/* 상태 변경 확인 다이얼로그 */}
      <ConfirmDialog
        isOpen={confirmDialog.open}
        title={confirmDialog.action === 'deactivate' ? '사용자 비활성화' : '사용자 재활성화'}
        message={
          confirmDialog.action === 'deactivate'
            ? `${confirmDialog.user?.name}님을 비활성화하시겠습니까? 로그인이 차단됩니다.`
            : `${confirmDialog.user?.name}님을 재활성화하시겠습니까? 다시 로그인할 수 있습니다.`
        }
        confirmText={confirmDialog.action === 'deactivate' ? '비활성화' : '재활성화'}
        variant={confirmDialog.action === 'deactivate' ? 'danger' : 'primary'}
        loading={submitting}
        onConfirm={handleStatusChange}
        onCancel={() => setConfirmDialog({ open: false, user: null, action: 'deactivate' })}
      />
    </AppShell>
  );
}
