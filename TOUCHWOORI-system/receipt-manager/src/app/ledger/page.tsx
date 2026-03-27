'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { useHotkey } from '@/hooks/useShortcutKey';
import { useToast } from '@/components/ui/Toast';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import DatePicker from '@/components/ui/DatePicker';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { formatCurrency, formatDateShort, today } from '@/lib/format';
import {
  BookOpen,
  Plus,
  Trash2,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileSpreadsheet,
  Paperclip,
  Loader2,
} from 'lucide-react';
import type { Ledger, LedgerEntryWithBalance, Category } from '@/types';

const PAGE_SIZE = 20;

interface EntryRow {
  id?: string;
  date: string;
  description: string;
  amount: string;
  category_id: string;
  memo: string;
}

const EMPTY_ROW = (prevDate?: string): EntryRow => ({
  date: prevDate || today(),
  description: '',
  amount: '',
  category_id: '',
  memo: '',
});

type SortField = 'date' | 'income' | 'expense' | 'category';
type SortDir = 'asc' | 'desc';

function LedgerPageInner() {
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ledgerIdParam = searchParams.get('ledgerId');
  const toast = useToast();
  // Data
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [selectedLedgerId, setSelectedLedgerId] = useState<string>('');
  const [entries, setEntries] = useState<LedgerEntryWithBalance[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [totalIncome, setTotalIncome]   = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [totalAll, setTotalAll]                 = useState(0);
  const [totalIncomeEntries, setTotalIncomeEntries] = useState(0);
  const [totalLinked, setTotalLinked]           = useState(0);
  const [totalUnlinked, setTotalUnlinked] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filterReceipt, setFilterReceipt] = useState<'all' | 'income-all' | 'expense-all' | 'linked' | 'unlinked'>('all');

  // Sort
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Multi-row entry modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [rows, setRows] = useState<EntryRow[]>([EMPTY_ROW()]);
  const [submitting, setSubmitting] = useState(false);
  const [autoSuggest, setAutoSuggest] = useState(true);
  const tableRef = useRef<HTMLTableElement>(null);

  // 단축키: ⌘S / Ctrl+S → 항목 저장 (모달 열려있을 때만)
  const saveShortcut = useHotkey('s', { meta: true }, () => handleAddSubmit(), { enabled: addModalOpen });

  // Receipt image modal
  const [receiptImageModal, setReceiptImageModal] = useState<{ open: boolean; imageUrl: string; receiptId: string }>({
    open: false, imageUrl: '', receiptId: '',
  });
  const [hoverPreviewUrl, setHoverPreviewUrl] = useState<string | null>(null);

  // Edit modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<LedgerEntryWithBalance | null>(null);
  const [editForm, setEditForm] = useState<EntryRow>(EMPTY_ROW());

  // Single delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    entry: LedgerEntryWithBalance | null;
  }>({ open: false, entry: null });
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  const isEditor = user?.role === 'accountant' || user?.role === 'master' || user?.role === 'sub_master';

  // 엑셀 내보내기
  const [exporting, setExporting] = useState(false);
  const handleExcelExport = async () => {
    if (!selectedLedgerId) return;
    setExporting(true);
    try {
      const body: Record<string, string> = { ledgerId: selectedLedgerId };
      if (startDate) body.startDate = startDate;
      if (endDate) body.endDate = endDate;
      const res = await fetch('/api/excel/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error);
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename\*?=(?:UTF-8'')?(.+)/);
      const filename = match ? decodeURIComponent(match[1]) : '장부.xlsx';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      toast.success('엑셀 파일이 다운로드되었습니다');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '내보내기에 실패했습니다');
    } finally {
      setExporting(false);
    }
  };

  // Load auto-suggest preference from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('category-auto-suggest');
    if (stored !== null) {
      setAutoSuggest(stored === 'true');
    }
  }, []);

  const toggleAutoSuggest = () => {
    const next = !autoSuggest;
    setAutoSuggest(next);
    localStorage.setItem('category-auto-suggest', String(next));
  };

  // Fetch ledgers
  const fetchLedgers = useCallback(async () => {
    try {
      const res = await fetch('/api/ledgers');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const activeLedgers = (json.data as Ledger[]).filter((l) => l.is_active);
      setLedgers(activeLedgers);
      if (activeLedgers.length > 0 && !selectedLedgerId) {
        const target = ledgerIdParam && activeLedgers.find((l) => l.id === ledgerIdParam);
        setSelectedLedgerId(target ? target.id : activeLedgers[0].id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '장부 목록을 불러올 수 없습니다');
    }
  }, [toast, selectedLedgerId]);

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setCategories((json.data as Category[]).filter((c) => c.is_active));
    } catch {
      // silent
    }
  }, []);

  // Fetch entries
  const fetchEntries = useCallback(async () => {
    if (!selectedLedgerId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (filterCategory) params.set('categoryId', filterCategory);
      if (searchText) params.set('search', searchText);
      if (filterReceipt !== 'all') params.set('receiptFilter', filterReceipt);

      const res = await fetch(`/api/ledgers/${selectedLedgerId}/entries?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setEntries(json.data || []);
      setTotal(json.total || 0);
      setTotalIncome(json.totalIncome  || 0);
      setTotalExpense(json.totalExpense || 0);
      setTotalAll(json.totalAll                       || 0);
      setTotalIncomeEntries(json.totalIncomeEntries   || 0);
      setTotalLinked(json.totalLinked                 || 0);
      setTotalUnlinked(json.totalUnlinked || 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '장부 항목을 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, [selectedLedgerId, page, startDate, endDate, filterCategory, searchText, filterReceipt, toast]);

  useEffect(() => {
    fetchLedgers();
    fetchCategories();
  }, [fetchLedgers, fetchCategories]);

  useEffect(() => {
    if (selectedLedgerId) {
      setSelectedIds(new Set());
      fetchEntries();
    }
  }, [selectedLedgerId, fetchEntries]);

  // Client-side sort
  const sortedEntries = [...entries].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const amount = (e: typeof a) => e.income || e.expense;
    switch (sortField) {
      case 'date':
        return (
          a.date.localeCompare(b.date) ||
          a.description.localeCompare(b.description) ||
          (amount(a) - amount(b)) ||
          (a.category?.name || '').localeCompare(b.category?.name || '')
        ) * dir;
      case 'income':
        return (
          (a.income - b.income) ||
          a.date.localeCompare(b.date) ||
          a.description.localeCompare(b.description) ||
          (a.category?.name || '').localeCompare(b.category?.name || '')
        ) * dir;
      case 'expense':
        return (
          (a.expense - b.expense) ||
          a.date.localeCompare(b.date) ||
          a.description.localeCompare(b.description) ||
          (a.category?.name || '').localeCompare(b.category?.name || '')
        ) * dir;
      case 'category':
        return (
          (a.category?.name || '').localeCompare(b.category?.name || '') ||
          a.date.localeCompare(b.date) ||
          a.description.localeCompare(b.description) ||
          (amount(a) - amount(b))
        ) * dir;
      default:
        return 0;
    }
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-gray-400" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-primary-600" />
    ) : (
      <ArrowDown className="h-3 w-3 text-primary-600" />
    );
  };

  // ─── Category auto-suggest ───
  const suggestCategory = (desc: string): string => {
    if (!autoSuggest || !desc.trim()) return '';
    const lower = desc.toLowerCase();
    for (const cat of categories) {
      if (cat.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
        return cat.id;
      }
    }
    return '';
  };

  // ─── Multi-row modal helpers ───
  const updateRow = (index: number, field: keyof EntryRow, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      // Auto-suggest on description change
      if (field === 'description' && autoSuggest) {
        if (!value.trim()) {
          // 항목명을 지우면 카테고리도 초기화 → 재입력 시 재추천 가능
          next[index].category_id = '';
        } else {
          const suggested = suggestCategory(value);
          if (suggested) {
            next[index].category_id = suggested;
          }
        }
      }
      return next;
    });
  };

  const addNewRow = () => {
    const lastRow = rows[rows.length - 1];
    setRows((prev) => [...prev, EMPTY_ROW(lastRow?.date)]);
  };

  const removeRow = (index: number) => {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent, rowIndex: number, field: keyof EntryRow) => {
    const isLastRow = rowIndex === rows.length - 1;

    if (e.key === 'Enter') {
      e.preventDefault();
      if (isLastRow) addNewRow();
      setTimeout(() => {
        const table = tableRef.current;
        if (table) {
          const nextRow = table.querySelectorAll('tbody tr')[rowIndex + 1];
          if (nextRow) {
            const firstInput = nextRow.querySelector('input, select') as HTMLElement;
            firstInput?.focus();
          }
        }
      }, 50);
    }

    // Tab on category select (last column) → add new row when on last row
    if (e.key === 'Tab' && !e.shiftKey && field === 'category_id' && isLastRow) {
      e.preventDefault();
      addNewRow();
      setTimeout(() => {
        const table = tableRef.current;
        if (table) {
          const nextRow = table.querySelectorAll('tbody tr')[rowIndex + 1];
          if (nextRow) {
            const firstInput = nextRow.querySelector('input, select') as HTMLElement;
            firstInput?.focus();
          }
        }
      }, 50);
    }
  };

  // Amount formatting for modal input
  const formatAmount = (value: string): string => {
    const num = value.replace(/[^0-9]/g, '');
    if (!num) return '';
    return Number(num).toLocaleString('ko-KR');
  };

  const parseAmount = (value: string): number => {
    return Number(value.replace(/[^0-9]/g, '')) || 0;
  };

  const handleAddSubmit = useCallback(async () => {
    const validRows = rows.filter(
      (r) => r.date && r.description.trim() && parseAmount(r.amount) > 0 && r.category_id
    );
    if (validRows.length === 0) {
      toast.error('유효한 항목이 없습니다. 날짜, 항목명, 금액, 카테고리를 모두 입력해주세요.');
      return;
    }

    setSubmitting(true);
    try {
      const entriesPayload = validRows.map((r) => {
        const cat = categories.find((c) => c.id === r.category_id);
        const amount = parseAmount(r.amount);
        return {
          date: r.date,
          description: r.description.trim(),
          income: cat?.type === 'income' ? amount : 0,
          expense: cat?.type === 'expense' ? amount : 0,
          category_id: r.category_id,
          memo: r.memo || null,
        };
      });

      const res = await fetch(`/api/ledgers/${selectedLedgerId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: entriesPayload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      toast.success(`${validRows.length}건의 항목이 등록되었습니다`);
      setAddModalOpen(false);
      setRows([EMPTY_ROW()]);
      fetchEntries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  }, [rows, selectedLedgerId, categories]);

  const hasUnsavedChanges = rows.some(
    (r) => r.description.trim() || parseAmount(r.amount) > 0
  );

  // ─── Edit modal ───
  const openEditModal = (entry: LedgerEntryWithBalance) => {
    if (!isEditor) return;
    setEditEntry(entry);
    setEditForm({
      date: entry.date,
      description: entry.description,
      amount: (entry.income || entry.expense).toLocaleString('ko-KR'),
      category_id: entry.category_id,
      memo: entry.memo || '',
    });
    setEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEntry) return;

    const cat = categories.find((c) => c.id === editForm.category_id);
    const amount = parseAmount(editForm.amount);

    if (!editForm.date || !editForm.description.trim() || !amount || !editForm.category_id) {
      toast.error('모든 필수 항목을 입력해주세요');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/ledgers/${selectedLedgerId}/entries`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editEntry.id,
          date: editForm.date,
          description: editForm.description.trim(),
          income: cat?.type === 'income' ? amount : 0,
          expense: cat?.type === 'expense' ? amount : 0,
          category_id: editForm.category_id,
          memo: editForm.memo || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      toast.success('항목이 수정되었습니다');
      setEditModalOpen(false);
      setEditEntry(null);
      fetchEntries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '수정에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Delete ───
  const handleDelete = async () => {
    const entry = deleteConfirm.entry;
    if (!entry) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(
        `/api/ledgers/${selectedLedgerId}/entries?id=${entry.id}`,
        { method: 'DELETE' }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      toast.success('항목이 삭제되었습니다');
      setDeleteConfirm({ open: false, entry: null });
      fetchEntries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '삭제에 실패했습니다');
    } finally {
      setDeleteLoading(false);
    }
  };

  // ─── Bulk delete ───
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleteLoading(true);
    try {
      const ids = Array.from(selectedIds).join(',');
      const res = await fetch(
        `/api/ledgers/${selectedLedgerId}/entries?ids=${ids}`,
        { method: 'DELETE' }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      toast.success(`${selectedIds.size}건의 항목이 삭제되었습니다`);
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
      fetchEntries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '삭제에 실패했습니다');
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  // ─── Search handler ───
  const handleSearch = () => {
    setSearchText(searchInput);
    setPage(1);
  };

  // ─── Multi-select helpers ───
  const selectableEntries = sortedEntries; // 모든 항목 선택/삭제 가능
  const allSelected = selectableEntries.length > 0 && selectedIds.size === selectableEntries.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableEntries.map((e) => e.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-500 rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/20 p-2.5">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">장부 조회</h1>
                <p className="text-sm text-white/80 mt-0.5">수입/지출 내역을 확인합니다</p>
              </div>
            </div>
            {/* 실시간 합계 */}
            <div className="flex gap-4 text-sm flex-wrap">
              <div className="bg-white/10 rounded-xl px-4 py-2 text-center min-w-[100px]">
                <p className="text-white/60 text-xs">총 수입</p>
                <p className="text-white font-bold tabular-nums">{formatCurrency(totalIncome)}</p>
              </div>
              <div className="bg-white/10 rounded-xl px-4 py-2 text-center min-w-[100px]">
                <p className="text-white/60 text-xs">총 지출</p>
                <p className="text-white font-bold tabular-nums">{formatCurrency(totalExpense)}</p>
              </div>
              <div className={`rounded-xl px-4 py-2 text-center min-w-[100px] ${
                totalIncome - totalExpense >= 0 ? 'bg-emerald-500/30' : 'bg-rose-500/30'
              }`}>
                <p className="text-white/60 text-xs">현재 잔액</p>
                <p className="text-white font-bold tabular-nums">{formatCurrency(totalIncome - totalExpense)}</p>
              </div>
            </div>
            {isEditor && (
              <div className="flex gap-2">
                {selectedIds.size > 0 && (
                  <Button
                    variant="danger"
                    onClick={() => setBulkDeleteConfirm(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    선택 삭제 ({selectedIds.size}건)
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => router.push('/excel')}
                  className="!bg-white/20 !border-white/30 !text-white hover:!bg-white/30"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  엑셀 가져오기
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setRows([EMPTY_ROW()]);
                    setAddModalOpen(true);
                  }}
                  className="!bg-white/20 !border-white/30 !text-white hover:!bg-white/30"
                >
                  <Plus className="h-4 w-4" />
                  항목 추가
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Ledger selector + Filters */}
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
          {/* Ledger dropdown */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm font-medium text-gray-700 shrink-0">장부</label>
            <select
              value={selectedLedgerId}
              onChange={(e) => {
                setSelectedLedgerId(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm
                focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                outline-none transition-shadow min-w-[180px]"
            >
              {ledgers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} {l.type === 'main' ? '(본 장부)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Filters row */}
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-shrink-0">
              <label className="block text-xs font-medium text-gray-500 mb-1">시작일</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm
                  focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                  outline-none transition-shadow"
              />
            </div>
            <div className="flex-shrink-0">
              <label className="block text-xs font-medium text-gray-500 mb-1">종료일</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm
                  focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                  outline-none transition-shadow"
              />
            </div>
            <div className="flex-shrink-0">
              <label className="block text-xs font-medium text-gray-500 mb-1">카테고리</label>
              <select
                value={filterCategory}
                onChange={(e) => {
                  setFilterCategory(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm
                  focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                  outline-none transition-shadow min-w-[140px]"
              >
                <option value="">전체</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">검색</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="항목명 또는 금액 검색"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm
                    focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                    outline-none transition-shadow"
                />
                <Button size="sm" variant="secondary" onClick={handleSearch} shortcut="↵">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* 영수증 연동 현황 + 필터 */}
        {!loading && entries.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm px-5 py-3 flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-500 font-medium shrink-0">항목 보기</span>
            <div className="flex gap-1.5 flex-wrap flex-1">
              {([
                { key: 'all'         as const, label: `장부전체 ${totalAll}건`,                          active: 'bg-primary-50 border-primary-400 text-primary-700' },
                { key: 'income-all'  as const, label: `수입전체 ${totalIncomeEntries}건`,                 active: 'bg-emerald-50 border-emerald-500 text-emerald-700' },
                { key: 'expense-all' as const, label: `지출전체 ${totalLinked + totalUnlinked}건`,         active: 'bg-rose-50 border-rose-400 text-rose-700' },
                { key: 'linked'      as const, label: `영수증 제출완료 ${totalLinked}건`,                  active: 'bg-blue-50 border-blue-400 text-blue-700' },
                { key: 'unlinked'    as const, label: `영수증 미제출 ${totalUnlinked}건`,                  active: 'bg-amber-50 border-amber-400 text-amber-700' },
              ]).map(({ key, label, active }) => (
                <button
                  key={key}
                  onClick={() => { setFilterReceipt(key); setPage(1); }}
                  className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                    filterReceipt === key ? active : 'border-gray-200 text-gray-500 hover:border-gray-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {totalUnlinked > 0 && (
              <button
                onClick={() => router.push('/receipts/upload')}
                className="text-xs text-primary-600 hover:text-primary-800 font-medium shrink-0"
              >
                영수증 업로드 →
              </button>
            )}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="장부에 항목이 없습니다"
            description={isEditor ? '항목을 추가하거나 엑셀에서 가져오세요' : '아직 등록된 항목이 없습니다'}
            actionLabel={isEditor ? '항목 추가' : undefined}
            onAction={
              isEditor
                ? () => {
                    setRows([EMPTY_ROW()]);
                    setAddModalOpen(true);
                  }
                : undefined
            }
          />
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {isEditor && (
                      <th className="pl-4 pr-2 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => { if (el) el.indeterminate = someSelected; }}
                          onChange={toggleSelectAll}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600
                            focus:ring-primary-500 cursor-pointer"
                          title="전체 선택"
                        />
                      </th>
                    )}
                    <th
                      className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none"
                      onClick={() => handleSort('date')}
                    >
                      <div className="flex items-center gap-1">
                        날짜
                        <SortIcon field="date" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">항목</th>
                    <th
                      className="px-4 py-3 text-right font-medium text-gray-600 cursor-pointer select-none"
                      onClick={() => handleSort('income')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        수입
                        <SortIcon field="income" />
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-right font-medium text-gray-600 cursor-pointer select-none"
                      onClick={() => handleSort('expense')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        지출
                        <SortIcon field="expense" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">잔액</th>
                    <th
                      className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none"
                      onClick={() => handleSort('category')}
                    >
                      <div className="flex items-center gap-1">
                        카테고리
                        <SortIcon field="category" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">비고</th>
                    {isEditor && (
                      <th className="px-4 py-3 text-center font-medium text-gray-600 w-12"></th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedEntries.map((entry) => {
                    const isNew = Date.now() - new Date(entry.created_at).getTime() < 24 * 60 * 60 * 1000;
                    return (
                    <tr
                      key={entry.id}
                      className={`transition-colors ${
                        selectedIds.has(entry.id)
                          ? 'bg-primary-50'
                          : isNew
                          ? 'bg-amber-50 hover:bg-amber-100'
                          : 'hover:bg-gray-50'
                      } ${isEditor ? 'cursor-pointer' : ''}`}
                      onClick={() => {
                        if (isEditor) openEditModal(entry);
                      }}
                    >
                      {isEditor && (
                        <td className="pl-4 pr-2 py-3 w-10">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(entry.id)}
                            onChange={() => toggleSelectOne(entry.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4 rounded border-gray-300 text-primary-600
                              focus:ring-primary-500 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap tabular-nums">
                        {formatDateShort(entry.date)}
                      </td>
                      <td className="px-4 py-3 text-gray-900 max-w-[220px]">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{entry.description}</span>
                          {isNew && (
                            <span className="shrink-0 inline-flex items-center text-[10px] font-bold
                              px-1.5 py-0.5 rounded-full bg-amber-400 text-white">
                              NEW
                            </span>
                          )}
                          {entry.receipt_id ? (
                            <ReceiptPreviewBadge
                              receiptId={entry.receipt_id}
                              imageUrl={(entry as any).receipts?.image_url || null}
                              onOpenModal={(imageUrl) =>
                                setReceiptImageModal({ open: true, imageUrl, receiptId: entry.receipt_id! })
                              }
                              onHoverPreview={setHoverPreviewUrl}
                            />
                          ) : (
                            // 지출 항목만 미연동 표시 (수입은 영수증 불필요)
                            entry.expense > 0 && (
                              <span className="shrink-0 inline-flex items-center text-[10px]
                                px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 border border-gray-200">
                                미제출
                              </span>
                            )
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                        {entry.income > 0 ? (
                          <span className="text-emerald-600 font-medium">
                            {formatCurrency(entry.income)}
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                        {entry.expense > 0 ? (
                          <span className="text-rose-600 font-medium">
                            {formatCurrency(entry.expense)}
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums font-bold text-gray-900">
                        {formatCurrency(entry.balance)}
                      </td>
                      <td className="px-4 py-3">
                        {entry.category && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setFilterCategory(prev => prev === entry.category_id ? '' : entry.category_id);
                              setPage(1);
                            }}
                            title={filterCategory === entry.category_id ? '필터 해제' : '이 카테고리로 필터'}
                            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                              filterCategory === entry.category_id
                                ? 'ring-2 ring-offset-1 bg-gray-200 text-gray-900'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: entry.category.color || '#6366f1' }}
                            />
                            {entry.category.name}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-[120px] truncate">
                        {entry.memo || ''}
                      </td>
                      {isEditor && (
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm({ open: true, entry });
                            }}
                            className="rounded-lg p-1.5 text-gray-400 hover:text-danger-600 hover:bg-danger-50 transition-colors"
                            title="삭제"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <Pagination
          totalItems={total}
          pageSize={PAGE_SIZE}
          currentPage={page}
          onPageChange={setPage}
        />
      </div>

      {/* ─── Multi-row entry modal ─── */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="항목 추가"
        size="xl"
        preventClose={hasUnsavedChanges}
      >
        <div className="space-y-4">
          {/* Auto-suggest toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">
              총 {rows.length}행 | 유효:{' '}
              {rows.filter((r) => r.description.trim() && parseAmount(r.amount) > 0 && r.category_id).length}행
            </span>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={autoSuggest}
                onChange={toggleAutoSuggest}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              카테고리 자동 추천
            </label>
          </div>

          {/* Entry table */}
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table ref={tableRef} className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 text-left font-medium text-gray-600 w-[130px]">날짜</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">항목명</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600 w-[140px]">금액</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 w-[150px]">카테고리</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600 w-[40px]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-2 py-1.5">
                      <input
                        type="date"
                        value={row.date}
                        onChange={(e) => updateRow(idx, 'date', e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, idx, 'date')}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm
                          focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={row.description}
                        onChange={(e) => updateRow(idx, 'description', e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, idx, 'description')}
                        placeholder="항목명 입력"
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm
                          focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={row.amount}
                        onChange={(e) => updateRow(idx, 'amount', formatAmount(e.target.value))}
                        onKeyDown={(e) => handleKeyDown(e, idx, 'amount')}
                        placeholder="0"
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-right tabular-nums
                          focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={row.category_id}
                        onChange={(e) => updateRow(idx, 'category_id', e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, idx, 'category_id')}
                        className={`w-full rounded border border-gray-300 px-2 py-1.5 text-sm
                          focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none
                          ${!row.category_id ? 'text-gray-400' : ''}`}
                      >
                        <option value="">선택</option>
                        <optgroup label="수입">
                          {categories
                            .filter((c) => c.type === 'income')
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                        </optgroup>
                        <optgroup label="지출">
                          {categories
                            .filter((c) => c.type === 'expense')
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                        </optgroup>
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {rows.length > 1 && (
                        <button
                          onClick={() => removeRow(idx)}
                          className="rounded p-1 text-gray-400 hover:text-danger-600 hover:bg-danger-50 transition-colors"
                          title="행 삭제"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={addNewRow}
            className="w-full rounded-lg border-2 border-dashed border-gray-300 py-2 text-sm text-gray-500
              hover:border-primary-400 hover:text-primary-600 transition-colors"
          >
            + 행 추가
          </button>

          {/* Shortcut tips */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400 border-t border-gray-200 pt-3">
            <span>
              <kbd className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-500">Tab</kbd>
              {' '}다음 칸으로 이동 (카테고리 칸에서 → 새 행)
            </span>
            <span>
              <kbd className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-500">Enter</kbd>
              {' '}새 항목 행 추가
            </span>
            <span>
              <kbd className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-500">⌘S</kbd>
              {' / '}
              <kbd className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-500">Ctrl+S</kbd>
              {' '}전체 저장
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <Button
              variant="secondary"
              onClick={() => setAddModalOpen(false)}
              disabled={submitting}
              shortcut="Esc"
            >
              취소
            </Button>
            <Button onClick={handleAddSubmit} loading={submitting} shortcut={saveShortcut}>
              전체 저장
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Edit modal ─── */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setEditEntry(null);
        }}
        title="항목 수정"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {editEntry?.source === 'receipt' && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              <span className="shrink-0 mt-0.5">⚠️</span>
              <span>영수증 연동 항목입니다. 수정 시 영수증 원본과 내용이 달라질 수 있습니다.</span>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">날짜 *</label>
            <input
              type="date"
              value={editForm.date}
              onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-shadow"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">항목명 *</label>
            <input
              type="text"
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-shadow"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">금액 *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                ₩
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={editForm.amount}
                onChange={(e) =>
                  setEditForm({ ...editForm, amount: formatAmount(e.target.value) })
                }
                required
                className="w-full rounded-lg border border-gray-300 pl-7 pr-3 py-2 text-sm text-right tabular-nums
                  focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-shadow"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">카테고리 *</label>
            <select
              value={editForm.category_id}
              onChange={(e) => setEditForm({ ...editForm, category_id: e.target.value })}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-shadow"
            >
              <option value="">선택</option>
              <optgroup label="수입">
                {categories
                  .filter((c) => c.type === 'income')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="지출">
                {categories
                  .filter((c) => c.type === 'expense')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">비고</label>
            <input
              type="text"
              value={editForm.memo}
              onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })}
              placeholder="메모 (선택)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-shadow"
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setEditModalOpen(false);
                setEditEntry(null);
              }}
              disabled={submitting}
              shortcut="Esc"
            >
              취소
            </Button>
            <Button type="submit" loading={submitting} shortcut="↵">
              수정하기
            </Button>
          </div>
        </form>
      </Modal>

      {/* ─── Single delete confirm ─── */}
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="항목 삭제"
        message={`"${deleteConfirm.entry?.description}" 항목을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
        confirmText="삭제"
        variant="danger"
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm({ open: false, entry: null })}
      />

      {/* ─── Bulk delete confirm ─── */}
      <ConfirmDialog
        isOpen={bulkDeleteConfirm}
        title="선택 항목 삭제"
        message={`선택한 ${selectedIds.size}건의 항목을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
        confirmText={`${selectedIds.size}건 삭제`}
        variant="danger"
        loading={bulkDeleteLoading}
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDeleteConfirm(false)}
      />

      {/* ─── 영수증 hover 미리보기 ─── */}
      {hoverPreviewUrl && (
        <div className="fixed top-1/2 right-4 md:right-10 -translate-y-1/2 z-50 pointer-events-none
                        w-52 md:w-72 bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
          <img
            src={hoverPreviewUrl}
            loading="lazy"
            alt="영수증 미리보기"
            className="w-full object-contain max-h-72 md:max-h-96"
          />
        </div>
      )}

      {/* ─── 영수증 이미지 확대 모달 ─── */}
      <Modal
        isOpen={receiptImageModal.open}
        onClose={() => setReceiptImageModal({ open: false, imageUrl: '', receiptId: '' })}
        title="영수증 이미지"
        size="xl"
      >
        <div className="space-y-3">
          {receiptImageModal.imageUrl ? (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={receiptImageModal.imageUrl}
                alt="영수증"
                className="max-h-[70vh] object-contain rounded-lg"
              />
            </div>
          ) : (
            <p className="text-center text-gray-400 py-12">이미지가 없습니다</p>
          )}
          <div className="flex justify-end">
            <button
              onClick={() => {
                setReceiptImageModal({ open: false, imageUrl: '', receiptId: '' });
                router.push(`/receipts/${receiptImageModal.receiptId}`);
              }}
              className="text-sm text-primary-600 hover:text-primary-800 font-medium"
            >
              영수증 상세 보기 →
            </button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}

export default function LedgerPage() {
  return (
    <Suspense>
      <LedgerPageInner />
    </Suspense>
  );
}

// ─── 영수증 미리보기 뱃지 ──────────────────────────────────────────
function ReceiptPreviewBadge({
  receiptId,
  imageUrl,
  onOpenModal,
  onHoverPreview,
}: {
  receiptId: string;
  imageUrl: string | null;
  onOpenModal: (imageUrl: string) => void;
  onHoverPreview: (url: string | null) => void;
}) {
  return (
    <button
      onMouseEnter={() => { if (imageUrl) onHoverPreview(imageUrl); }}
      onMouseLeave={() => onHoverPreview(null)}
      onClick={(e) => {
        e.stopPropagation();
        if (imageUrl) onOpenModal(imageUrl);
      }}
      className="inline-flex items-center gap-0.5 text-[10px] font-medium
        px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700
        border border-emerald-200 hover:bg-emerald-100 transition-colors shrink-0"
    >
      <Paperclip className="h-2.5 w-2.5" />
      영수증
    </button>
  );
}
