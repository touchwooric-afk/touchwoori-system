'use client';

export const runtime = 'edge';


import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '@/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import DatePicker from '@/components/ui/DatePicker';
import EmptyState from '@/components/ui/EmptyState';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { formatCurrency, formatDateShort, today } from '@/lib/format';
import { FileText, Download, Eye, FileX } from 'lucide-react';
import type { Ledger } from '@/types';

// 전반기(12월~4월) / 후반기(5월~11월) 날짜 계산
function getHalfYearPresets() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const baseYear = month === 12 ? year : year - 1;
  return {
    firstHalf:  { start: `${baseYear}-12-01`,     end: `${baseYear + 1}-04-30` },
    secondHalf: { start: `${baseYear + 1}-05-01`, end: `${baseYear + 1}-11-30` },
  };
}

// 특정 연/월의 1일~말일 계산
function getMonthRange(year: number, month: number) {
  const lastDay = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

interface IncomeItem {
  date: string;
  description: string;
  amount: number;
  categoryName: string;
}

interface ExpenseItem {
  date: string;
  description: string;
  amount: number;
  categoryName: string;
  imageUrl: string | null;
}

interface CatSummary {
  category: string;
  total: number;
}

interface PdfData {
  title: string;
  period: { startDate: string; endDate: string };
  carryoverBalance: number;
  totalIncome: number;
  totalExpense: number;
  endingBalance: number;
  incomeSummary: CatSummary[];
  expenseSummary: CatSummary[];
  incomeItems: IncomeItem[];
  expenseItems: ExpenseItem[];
}

export default function SettlementsPage() {
  const { user } = useUser();
  const toast = useToast();

  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(true);
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; });

  // Selection — 기본값으로 현재 반기 자동 설정
  const defaultPreset = (() => {
    const now = new Date();
    const m = now.getMonth() + 1;
    const { firstHalf, secondHalf } = getHalfYearPresets();
    // 12~4월이면 전반기, 5~11월이면 후반기
    return (m >= 5 && m <= 11)
      ? { id: '__second_half__', ...secondHalf }
      : { id: '__first_half__', ...firstHalf };
  })();
  const [selectedSettlement, setSelectedSettlement] = useState(defaultPreset.id);
  const [startDate, setStartDate] = useState(defaultPreset.start);
  const [endDate, setEndDate] = useState(defaultPreset.end);
  const [selectedLedger, setSelectedLedger] = useState('');

  // 월별 결산용 연/월 state (기본: 이번 달)
  const [monthlyYear, setMonthlyYear] = useState(new Date().getFullYear());
  const [monthlyMonth, setMonthlyMonth] = useState(new Date().getMonth() + 1);

  // PDF data
  const [pdfData, setPdfData] = useState<PdfData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);

  // Fetch ledgers
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const ledgerRes = await fetch('/api/ledgers');
      const ledgerJson = await ledgerRes.json();
      if (ledgerRes.ok) {
        const active = (ledgerJson.data as Ledger[]).filter((l) => l.is_active);
        setLedgers(active);
      }
    } catch {
      toastRef.current.error('데이터를 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // When settlement changes, set dates
  const handleSettlementChange = (id: string) => {
    setSelectedSettlement(id);
    setPdfData(null);
    const { firstHalf, secondHalf } = getHalfYearPresets();
    if (id === '__monthly__') {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      setMonthlyYear(y);
      setMonthlyMonth(m);
      const range = getMonthRange(y, m);
      setStartDate(range.start);
      setEndDate(range.end);
    } else if (id === '__first_half__') {
      setStartDate(firstHalf.start);
      setEndDate(firstHalf.end);
    } else if (id === '__second_half__') {
      setStartDate(secondHalf.start);
      setEndDate(secondHalf.end);
    }
    // "직접 입력" 선택 시 기존 날짜 유지 (의도적으로 아무것도 안 함)
  };

  // 선택된 결산 기간에서 날짜를 확정적으로 가져오는 헬퍼
  const resolveDates = (): { start: string; end: string } | null => {
    // 1. state에 날짜가 있으면 그대로 사용
    if (startDate && endDate) return { start: startDate, end: endDate };
    // 2. state가 비었으면 selectedSettlement에서 복원 시도
    const { firstHalf, secondHalf } = getHalfYearPresets();
    if (selectedSettlement === '__monthly__') { const r = getMonthRange(monthlyYear, monthlyMonth); return { start: r.start, end: r.end }; }
    if (selectedSettlement === '__first_half__') return { start: firstHalf.start, end: firstHalf.end };
    if (selectedSettlement === '__second_half__') return { start: secondHalf.start, end: secondHalf.end };
    return null;
  };

  // Preview
  const handlePreview = async () => {
    const dates = resolveDates();
    if (!dates) {
      toast.error('시작일과 종료일을 선택해주세요');
      return;
    }
    // state도 동기화 (비어있었다면 채워줌)
    if (!startDate || !endDate) {
      setStartDate(dates.start);
      setEndDate(dates.end);
    }
    setPreviewLoading(true);
    setPdfData(null);
    try {
      const body: Record<string, string> = { startDate: dates.start, endDate: dates.end };
      if (selectedLedger) body.ledgerId = selectedLedger;

      const res = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setPdfData(json.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '미리보기 생성에 실패했습니다');
    } finally {
      setPreviewLoading(false);
    }
  };

  // 이미지를 canvas로 로드하여 EXIF 방향 자동 보정 + 리사이즈 + dataURL 변환
  const normalizeImage = (url: string): Promise<string> => {
    const MAX_PX = 1200; // 200dpi 인쇄 품질 기준 최대 해상도
    return new Promise((resolve) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ratio = Math.min(MAX_PX / img.naturalWidth, MAX_PX / img.naturalHeight, 1);
        canvas.width = Math.round(img.naturalWidth * ratio);
        canvas.height = Math.round(img.naturalHeight * ratio);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => resolve(url); // 실패 시 원본 URL 그대로
      img.src = url;
    });
  };

  // PDF download
  const handleDownload = async () => {
    if (!pdfData || (pdfData.expenseItems.length === 0 && pdfData.incomeItems.length === 0)) return;
    setDownloadLoading(true);
    try {
      // 이미지 EXIF 방향 보정을 위한 전처리
      const imageUrls = pdfData.expenseItems.map((item) => item.imageUrl).filter(Boolean) as string[];
      const normalizedMap = new Map<string, string>();
      if (imageUrls.length > 0) {
        const results = await Promise.all(imageUrls.map(async (url) => {
          const dataUrl = await normalizeImage(url);
          return [url, dataUrl] as const;
        }));
        for (const [orig, data] of results) normalizedMap.set(orig, data);
      }

      const {
        pdf, Font, Document, Page, View, Text, Image, StyleSheet,
      } = await import('@react-pdf/renderer');

      // 한국어 폰트 등록 (NanumGothic TTF)
      Font.register({
        family: 'NanumGothic',
        src: `${window.location.origin}/fonts/NanumGothic-Regular.ttf`,
      });

      const F = 'NanumGothic';

      // A4: 595 × 842 pt  |  패딩 20pt
      // 셀 가로: (555 - 6) / 2 = 274.5   세로: (802 - 6) / 2 = 398
      // 셀 내 정보 헤더: 36pt  →  이미지: 360pt
      const CELL_W = 274.5;
      const CELL_H = 395;
      const ROW_GAP = 6;
      const COL_GAP = 6;
      const IMG_H  = CELL_H - 36;

      const styles = StyleSheet.create({
        // ── 요약 페이지 ──────────────────────────────────────
        summaryPage:  { padding: 48, fontFamily: F },
        title:        { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 6 },
        period:       { fontSize: 10, textAlign: 'center', color: '#888', marginBottom: 28 },
        sectionTitle: { fontSize: 11, fontWeight: 'bold', marginBottom: 8, color: '#333' },
        tableRow: {
          flexDirection: 'row', justifyContent: 'space-between',
          paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: '#ddd',
        },
        tableCell:  { fontSize: 10, color: '#444' },
        tableCellR: { fontSize: 10, color: '#444', textAlign: 'right' },
        totalRow: {
          flexDirection: 'row', justifyContent: 'space-between',
          paddingVertical: 6, borderTopWidth: 1.5, borderTopColor: '#333', marginTop: 2,
        },
        totalLabel: { fontSize: 11, fontWeight: 'bold' },
        totalValue: { fontSize: 11, fontWeight: 'bold', textAlign: 'right' },
        pageNum:    { position: 'absolute', bottom: 20, right: 48, fontSize: 8, color: '#bbb' },

        // ── 영수증 4분할 페이지 ──────────────────────────────
        receiptPage: { padding: 20, fontFamily: F },
        row:  { flexDirection: 'row', gap: COL_GAP },
        rowGap: { height: ROW_GAP },
        cell: {
          width: CELL_W, height: CELL_H,
          borderWidth: 0.5, borderColor: '#ddd', borderRadius: 3,
          overflow: 'hidden',
        },
        cellHeader: {
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          paddingHorizontal: 6, paddingVertical: 4,
          borderBottomWidth: 0.5, borderBottomColor: '#e8e8e8',
          backgroundColor: '#fafafa',
        },
        cellDesc:   { fontSize: 8, fontWeight: 'bold', color: '#222', flex: 1 },
        cellMeta:   { fontSize: 7, color: '#888', flex: 1, textAlign: 'right' },
        cellAmount: { fontSize: 8, fontWeight: 'bold', color: '#c53030', marginLeft: 4 },
        cellImage:  { width: CELL_W, height: IMG_H, objectFit: 'contain', backgroundColor: '#f9f9f9' },
        cellNoImg:  { width: CELL_W, height: IMG_H, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
        cellNoImgTxt: { fontSize: 8, color: '#ccc' },
      });

      // ── 영수증 이미지 페이지 분할 ──
      const receiptPages: ExpenseItem[][] = [];
      for (let i = 0; i < pdfData.expenseItems.length; i += 4) {
        receiptPages.push(pdfData.expenseItems.slice(i, i + 4));
      }
      const totalPages = 1 + receiptPages.length;

      const renderCell = (item: ExpenseItem, i: number) => {
        const imgSrc = item.imageUrl ? (normalizedMap.get(item.imageUrl) || item.imageUrl) : null;
        return (
          <View key={i} style={styles.cell}>
            <View style={styles.cellHeader}>
              <Text style={styles.cellDesc}>{item.description}</Text>
              <Text style={styles.cellMeta}>{item.date} · {item.categoryName}</Text>
              <Text style={styles.cellAmount}>{item.amount.toLocaleString('ko-KR')}원</Text>
            </View>
            {imgSrc ? (
              <Image src={imgSrc} style={styles.cellImage} />
            ) : (
              <View style={styles.cellNoImg}>
                <Text style={styles.cellNoImgTxt}>이미지 없음</Text>
              </View>
            )}
          </View>
        );
      };

      // 요약표 행 스타일 헬퍼
      const summaryRow = (label: string, value: number, color = '#444') => (
        <View style={styles.tableRow}>
          <Text style={styles.tableCell}>{label}</Text>
          <Text style={{ ...styles.tableCellR, color }}>{value.toLocaleString('ko-KR')} 원</Text>
        </View>
      );

      const PdfDoc = (
        <Document>
          {/* ── 1페이지: 결산 요약표 ── */}
          <Page size="A4" style={styles.summaryPage} wrap={false}>
            <Text style={styles.title}>{pdfData.title}</Text>
            <Text style={styles.period}>
              {pdfData.period.startDate} ~ {pdfData.period.endDate}
            </Text>

            {/* 수입부 (이월 잔액 포함) */}
            <Text style={styles.sectionTitle}>수입부</Text>
            <View style={{ ...styles.tableRow, backgroundColor: '#eff6ff' }}>
              <Text style={{ ...styles.tableCell, color: '#1e40af' }}>이월 잔액</Text>
              <Text style={{ ...styles.tableCellR, color: '#1e3a8a', fontWeight: 'bold' }}>{pdfData.carryoverBalance.toLocaleString('ko-KR')} 원</Text>
            </View>
            {pdfData.incomeSummary.map((s, i) => (
              <View key={`inc-${i}`} style={{ ...styles.tableRow, borderBottomColor: '#bbf7d0' }}>
                <Text style={styles.tableCell}>{s.category}</Text>
                <Text style={{ ...styles.tableCellR, color: '#166534' }}>{s.total.toLocaleString('ko-KR')} 원</Text>
              </View>
            ))}
            <View style={{ ...styles.totalRow, borderTopColor: '#16a34a' }}>
              <Text style={styles.totalLabel}>수입부 합계</Text>
              <Text style={{ ...styles.totalValue, color: '#166534' }}>{(pdfData.carryoverBalance + pdfData.totalIncome).toLocaleString('ko-KR')} 원</Text>
            </View>
            <View style={{ height: 16 }} />

            {/* 지출부 */}
            <Text style={{ ...styles.sectionTitle, color: '#be123c' }}>지출부</Text>
            {pdfData.expenseSummary.map((s, i) => (
              <View key={`exp-${i}`} style={{ ...styles.tableRow, borderBottomColor: '#fecdd3' }}>
                <Text style={styles.tableCell}>{s.category}</Text>
                <Text style={{ ...styles.tableCellR, color: '#be123c' }}>{s.total.toLocaleString('ko-KR')} 원</Text>
              </View>
            ))}
            <View style={{ ...styles.totalRow, borderTopColor: '#be123c' }}>
              <Text style={styles.totalLabel}>지출부 합계</Text>
              <Text style={{ ...styles.totalValue, color: '#be123c' }}>{pdfData.totalExpense.toLocaleString('ko-KR')} 원</Text>
            </View>

            {/* 결산 총계 */}
            <View style={{ marginTop: 20, borderTopWidth: 2, borderTopColor: '#9ca3af', paddingTop: 10 }}>
              {summaryRow('수입부 합계', pdfData.carryoverBalance + pdfData.totalIncome, '#166534')}
              {summaryRow('지출부 합계', pdfData.totalExpense, '#be123c')}
              <View style={{ ...styles.totalRow, borderTopWidth: 2, borderTopColor: '#6b7280', marginTop: 4, paddingTop: 8 }}>
                <Text style={{ ...styles.totalLabel, fontSize: 13 }}>기말 잔액</Text>
                <Text style={{ ...styles.totalValue, fontSize: 13 }}>{pdfData.endingBalance.toLocaleString('ko-KR')} 원</Text>
              </View>
            </View>

            <Text style={styles.pageNum}>1 / {totalPages}</Text>
          </Page>

          {/* ── 2페이지~: 영수증 2×2 ── */}
          {receiptPages.map((pageItems, pi) => (
            <Page key={pi} size="A4" style={styles.receiptPage} wrap={false}>
              {/* 첫 번째 행 */}
              <View style={styles.row}>
                {pageItems.slice(0, 2).map((item, i) => renderCell(item, i))}
              </View>
              {/* 두 번째 행 (3개 이상일 때) */}
              {pageItems.length > 2 && (
                <>
                  <View style={styles.rowGap} />
                  <View style={styles.row}>
                    {pageItems.slice(2, 4).map((item, i) => renderCell(item, i + 2))}
                  </View>
                </>
              )}
              <Text style={styles.pageNum}>{pi + 2} / {totalPages}</Text>
            </Page>
          ))}
        </Document>
      );

      const blob = await pdf(PdfDoc).toBlob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${pdfData.title.replace(/[/\\:*?"<>|]/g, '')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('PDF가 다운로드되었습니다');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'PDF 생성에 실패했습니다');
    } finally {
      setDownloadLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-500 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/20 p-2.5">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">결산 PDF</h1>
              <p className="text-sm text-white/80 mt-0.5">기간별 카테고리 지출 합계와 영수증 원본을 하나의 PDF로 생성하여 인쇄 및 보관할 수 있습니다</p>
            </div>
          </div>
        </div>

        {/* Controls */}
        {loading ? (
          <CardSkeleton />
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
            {/* Settlement selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">결산 기간 선택</label>
              <select
                value={selectedSettlement}
                onChange={(e) => handleSettlementChange(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                  focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                  outline-none transition-shadow"
              >
                <option value="">직접 입력</option>
                <option value="__monthly__">월별 결산</option>
                {(() => {
                  const { firstHalf, secondHalf } = getHalfYearPresets();
                  return (
                    <>
                      <option value="__first_half__">
                        전반기 ({firstHalf.start} ~ {firstHalf.end})
                      </option>
                      <option value="__second_half__">
                        후반기 ({secondHalf.start} ~ {secondHalf.end})
                      </option>
                    </>
                  );
                })()}
              </select>
            </div>

            {/* 월별 결산 — 연/월 선택 */}
            {selectedSettlement === '__monthly__' && (
              <div className="flex items-center gap-3">
                <select
                  value={monthlyYear}
                  onChange={(e) => {
                    const y = Number(e.target.value);
                    setMonthlyYear(y);
                    const range = getMonthRange(y, monthlyMonth);
                    setStartDate(range.start);
                    setEndDate(range.end);
                    setPdfData(null);
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm
                    focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                    outline-none transition-shadow"
                >
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                    <option key={y} value={y}>{y}년</option>
                  ))}
                </select>
                <div className="flex gap-1 flex-wrap">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setMonthlyMonth(m);
                        const range = getMonthRange(monthlyYear, m);
                        setStartDate(range.start);
                        setEndDate(range.end);
                        setPdfData(null);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                        ${m === monthlyMonth
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                      {m}월
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Date range */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DatePicker
                label="시작일"
                value={startDate}
                onChange={setStartDate}
                required
              />
              <DatePicker
                label="종료일"
                value={endDate}
                onChange={setEndDate}
                required
              />
            </div>

            {/* Ledger */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                장부 <span className="text-xs text-gray-400">(미선택 시 본 장부)</span>
              </label>
              <select
                value={selectedLedger}
                onChange={(e) => setSelectedLedger(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                  focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                  outline-none transition-shadow"
              >
                <option value="">본 장부 (기본)</option>
                {ledgers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button onClick={handlePreview} loading={previewLoading}>
                <Eye className="h-4 w-4" />
                PDF 미리보기
              </Button>
              {pdfData && (pdfData.expenseItems.length > 0 || pdfData.incomeItems.length > 0) && (
                <Button
                  variant="secondary"
                  onClick={handleDownload}
                  loading={downloadLoading}
                >
                  <Download className="h-4 w-4" />
                  PDF 다운로드
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Preview */}
        {pdfData && (
          <div className="space-y-4">
            {pdfData.expenseItems.length === 0 && pdfData.incomeItems.length === 0 ? (
              <EmptyState
                icon={FileX}
                title="해당 기간에 항목이 없습니다"
                description="다른 기간을 선택해주세요"
              />
            ) : (
              <>
                {/* Summary card */}
                <div className="bg-white rounded-xl shadow-sm p-5">
                  <h2 className="text-lg font-semibold text-gray-900 mb-1">{pdfData.title}</h2>
                  <p className="text-sm text-gray-500 mb-4">
                    {formatDateShort(pdfData.period.startDate)} ~{' '}
                    {formatDateShort(pdfData.period.endDate)}
                  </p>

                  {/* 수입 테이블 (이월 잔액 포함) */}
                  <div className="border border-green-200 rounded-lg overflow-hidden mb-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-green-50 border-b border-green-200">
                          <th className="px-4 py-2 text-left font-medium text-green-700">수입부</th>
                          <th className="px-4 py-2 text-right font-medium text-green-700">금액</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-green-100">
                        <tr className="bg-blue-50/50">
                          <td className="px-4 py-2 text-blue-800 font-medium">이월 잔액</td>
                          <td className="px-4 py-2 text-right font-medium tabular-nums text-blue-800">{formatCurrency(pdfData.carryoverBalance)}</td>
                        </tr>
                        {pdfData.incomeSummary.map((s, i) => (
                          <tr key={i}>
                            <td className="px-4 py-2 text-gray-900">{s.category}</td>
                            <td className="px-4 py-2 text-right font-medium tabular-nums text-green-700">{formatCurrency(s.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-green-50 border-t-2 border-green-300">
                          <td className="px-4 py-2 font-bold text-green-800">수입부 합계</td>
                          <td className="px-4 py-2 text-right font-bold tabular-nums text-green-800">{formatCurrency(pdfData.carryoverBalance + pdfData.totalIncome)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* 지출 테이블 */}
                  <div className="border border-rose-200 rounded-lg overflow-hidden mb-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-rose-50 border-b border-rose-200">
                          <th className="px-4 py-2 text-left font-medium text-rose-700">지출부</th>
                          <th className="px-4 py-2 text-right font-medium text-rose-700">합계</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rose-100">
                        {pdfData.expenseSummary.map((s, i) => (
                          <tr key={i}>
                            <td className="px-4 py-2 text-gray-900">{s.category}</td>
                            <td className="px-4 py-2 text-right font-medium tabular-nums text-rose-700">{formatCurrency(s.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-rose-50 border-t-2 border-rose-300">
                          <td className="px-4 py-2 font-bold text-rose-800">지출부 합계</td>
                          <td className="px-4 py-2 text-right font-bold tabular-nums text-rose-800">{formatCurrency(pdfData.totalExpense)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* 결산 총계 */}
                  <div className="border-2 border-gray-300 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <tbody>
                        <tr className="border-b border-gray-200">
                          <td className="px-4 py-2.5 text-gray-700 font-medium">수입부 합계 (이월 + 당기 수입)</td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-medium text-green-700">{formatCurrency(pdfData.carryoverBalance + pdfData.totalIncome)}</td>
                        </tr>
                        <tr className="border-b border-gray-200">
                          <td className="px-4 py-2.5 text-gray-700 font-medium">지출부 합계</td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-medium text-rose-700">{formatCurrency(pdfData.totalExpense)}</td>
                        </tr>
                        <tr className="bg-gray-900">
                          <td className="px-4 py-3 font-bold text-white">기말 잔액</td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums text-white text-base">{formatCurrency(pdfData.endingBalance)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 지출 항목 영수증 그리드 */}
                {pdfData.expenseItems.length > 0 && (
                  <div>
                    <h3 className="text-base font-semibold text-gray-800 mb-3">지출 영수증 ({pdfData.expenseItems.length}건)</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {pdfData.expenseItems.map((item, i) => (
                        <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                          <div className="p-4">
                            <h3 className="text-sm font-semibold text-gray-900 truncate">{item.description}</h3>
                          </div>
                          {item.imageUrl ? (
                            <div className="px-4">
                              <img src={item.imageUrl} alt={item.description} className="w-full h-48 object-contain rounded-lg border border-gray-200 bg-gray-50" />
                            </div>
                          ) : (
                            <div className="mx-4 h-48 flex items-center justify-center rounded-lg bg-gray-50 border border-gray-200">
                              <span className="text-sm text-gray-400">[영수증 없음]</span>
                            </div>
                          )}
                          <div className="p-4 flex items-center justify-between">
                            <span className="text-xs text-gray-500">{formatDateShort(item.date)}</span>
                            <span className="text-sm font-bold text-rose-600 tabular-nums">{formatCurrency(item.amount)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
