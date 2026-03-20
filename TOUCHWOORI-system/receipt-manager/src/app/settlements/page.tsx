'use client';

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
import type { Ledger, Settlement } from '@/types';

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

interface PdfItem {
  date: string;
  description: string;
  expense: number;
  categoryName: string;
  imageUrl: string | null;
}

interface PdfSummary {
  category: string;
  total: number;
}

interface PdfData {
  title: string;
  period: { startDate: string; endDate: string };
  summary: PdfSummary[];
  items: PdfItem[];
}

export default function SettlementsPage() {
  const { user } = useUser();
  const toast = useToast();

  const [settlements, setSettlements] = useState<Settlement[]>([]);
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

  // PDF data
  const [pdfData, setPdfData] = useState<PdfData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);

  // Fetch settlements and ledgers (toast를 ref로 참조해 의존성 제거)
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [settRes, ledgerRes] = await Promise.all([
        fetch('/api/settlements'),
        fetch('/api/ledgers'),
      ]);
      const settJson = await settRes.json();
      const ledgerJson = await ledgerRes.json();

      if (settRes.ok) setSettlements(settJson.data || []);
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

  // URL params 최초 1회만 적용 (history 페이지에서 리다이렉트 시)
  const urlParamsApplied = useRef(false);
  useEffect(() => {
    if (urlParamsApplied.current || settlements.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const sId = params.get('settlement');
    if (sId) {
      urlParamsApplied.current = true;
      setSelectedSettlement(sId);
      const s = settlements.find((s) => s.id === sId);
      if (s) {
        if (s.start_date) setStartDate(s.start_date);
        if (s.end_date) setEndDate(s.end_date);
      }
    }
  }, [settlements]);

  // When settlement changes, set dates
  const handleSettlementChange = (id: string) => {
    setSelectedSettlement(id);
    setPdfData(null);
    const { firstHalf, secondHalf } = getHalfYearPresets();
    if (id === '__first_half__') {
      setStartDate(firstHalf.start);
      setEndDate(firstHalf.end);
    } else if (id === '__second_half__') {
      setStartDate(secondHalf.start);
      setEndDate(secondHalf.end);
    } else if (id) {
      const s = settlements.find((s) => s.id === id);
      if (s) {
        // null/빈값인 경우 기존 날짜 유지 (절대 빈 문자열로 덮어쓰지 않음)
        if (s.start_date) setStartDate(s.start_date);
        if (s.end_date) setEndDate(s.end_date);
      }
    }
    // "직접 입력" 선택 시 기존 날짜 유지 (의도적으로 아무것도 안 함)
  };

  // 선택된 결산 기간에서 날짜를 확정적으로 가져오는 헬퍼
  const resolveDates = (): { start: string; end: string } | null => {
    // 1. state에 날짜가 있으면 그대로 사용
    if (startDate && endDate) return { start: startDate, end: endDate };
    // 2. state가 비었으면 selectedSettlement에서 복원 시도
    const { firstHalf, secondHalf } = getHalfYearPresets();
    if (selectedSettlement === '__first_half__') return { start: firstHalf.start, end: firstHalf.end };
    if (selectedSettlement === '__second_half__') return { start: secondHalf.start, end: secondHalf.end };
    if (selectedSettlement) {
      const s = settlements.find((s) => s.id === selectedSettlement);
      if (s?.start_date && s?.end_date) return { start: s.start_date, end: s.end_date };
    }
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
      const selected = settlements.find((s) => s.id === selectedSettlement);
      if (selected) body.title = selected.title;

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

  // 이미지를 canvas로 로드하여 EXIF 방향 자동 보정 + dataURL 변환
  const normalizeImage = (url: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(url); // 실패 시 원본 URL 그대로
      img.src = url;
    });
  };

  // PDF download
  const handleDownload = async () => {
    if (!pdfData || pdfData.items.length === 0) return;
    setDownloadLoading(true);
    try {
      // 이미지 EXIF 방향 보정을 위한 전처리
      const imageUrls = pdfData.items.map((item) => item.imageUrl).filter(Boolean) as string[];
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

      const totalExpense = pdfData.summary.reduce((s, c) => s + c.total, 0);

      // ── 1페이지 요약표 높이 계산 → 남는 공간에 영수증 행 배치 ──
      // summaryPage padding: 48 * 2 = 96pt
      const PAGE_H = 842;
      const SUMMARY_PAD = 48;
      const usableH = PAGE_H - SUMMARY_PAD * 2; // 746pt
      const titleH   = 18 + 6;   // fontSize 18 + marginBottom 6
      const periodH  = 10 + 28;  // fontSize 10 + marginBottom 28
      const sectionH = 11 + 8;   // fontSize 11 + marginBottom 8
      const rowH     = 10 + 10;  // paddingVertical 5 * 2 + fontSize ~10
      const totalRowH = 12 + 6 + 2; // paddingVertical 6*2 + borderTop + marginTop
      const summaryContentH = titleH + periodH + sectionH + (pdfData.summary.length * rowH) + totalRowH;
      const remainingH = usableH - summaryContentH - 20; // 20pt 여백

      // 남은 공간에 몇 행(각 행 = 셀 높이 + gap)이 들어가는지 계산
      const firstPageRows = Math.floor((remainingH + ROW_GAP) / (CELL_H + ROW_GAP));
      const firstPageItems = Math.min(firstPageRows * 2, pdfData.items.length); // 행당 2개

      // 나머지 항목은 4개씩 페이지 분할
      const remainingItems = pdfData.items.slice(firstPageItems);
      const receiptPages: PdfItem[][] = [];
      for (let i = 0; i < remainingItems.length; i += 4) {
        receiptPages.push(remainingItems.slice(i, i + 4));
      }
      const totalPages = 1 + receiptPages.length;

      const renderCell = (item: PdfItem, i: number) => {
        const imgSrc = item.imageUrl ? (normalizedMap.get(item.imageUrl) || item.imageUrl) : null;
        return (
          <View key={i} style={styles.cell}>
            <View style={styles.cellHeader}>
              <Text style={styles.cellDesc}>{item.description}</Text>
              <Text style={styles.cellMeta}>{item.date} · {item.categoryName}</Text>
              <Text style={styles.cellAmount}>{item.expense.toLocaleString('ko-KR')}원</Text>
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

      // 1페이지에 넣을 영수증 행 분할
      const firstPageSlices: PdfItem[][] = [];
      for (let i = 0; i < firstPageItems; i += 2) {
        firstPageSlices.push(pdfData.items.slice(i, i + 2));
      }

      const PdfDoc = (
        <Document>
          {/* ── 1페이지: 합계표 + 남는 공간에 영수증 ── */}
          <Page size="A4" style={styles.summaryPage} wrap={false}>
            <Text style={styles.title}>{pdfData.title}</Text>
            <Text style={styles.period}>
              {pdfData.period.startDate} ~ {pdfData.period.endDate}
            </Text>
            <Text style={styles.sectionTitle}>카테고리별 지출 합계</Text>
            {pdfData.summary.map((s, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={styles.tableCell}>{s.category}</Text>
                <Text style={styles.tableCellR}>{s.total.toLocaleString('ko-KR')} 원</Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>합계</Text>
              <Text style={styles.totalValue}>{totalExpense.toLocaleString('ko-KR')} 원</Text>
            </View>

            {/* 남는 공간에 영수증 배치 */}
            {firstPageSlices.length > 0 && (
              <View style={{ marginTop: 16 }}>
                {firstPageSlices.map((rowItems, ri) => (
                  <View key={ri}>
                    {ri > 0 && <View style={styles.rowGap} />}
                    <View style={styles.row}>
                      {rowItems.map((item, i) => renderCell(item, i))}
                    </View>
                  </View>
                ))}
              </View>
            )}
            <Text style={styles.pageNum}>1 / {totalPages}</Text>
          </Page>

          {/* ── 2페이지~: 영수증 2×2 명시적 행 배치 ── */}
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
                {settlements.length > 0 && (
                  <option disabled>── 결산기 ──</option>
                )}
                {settlements.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} ({formatDateShort(s.start_date)} ~ {formatDateShort(s.end_date)})
                  </option>
                ))}
              </select>
            </div>

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
              {pdfData && pdfData.items.length > 0 && (
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
            {pdfData.items.length === 0 ? (
              <EmptyState
                icon={FileX}
                title="해당 기간에 지출 항목이 없습니다"
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

                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="px-4 py-2 text-left font-medium text-gray-600">
                            카테고리
                          </th>
                          <th className="px-4 py-2 text-right font-medium text-gray-600">
                            합계
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {pdfData.summary.map((s, i) => (
                          <tr key={i}>
                            <td className="px-4 py-2 text-gray-900">{s.category}</td>
                            <td className="px-4 py-2 text-right font-medium tabular-nums text-gray-900">
                              {formatCurrency(s.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 border-t-2 border-gray-300">
                          <td className="px-4 py-2 font-bold text-gray-900">합계</td>
                          <td className="px-4 py-2 text-right font-bold tabular-nums text-gray-900">
                            {formatCurrency(
                              pdfData.summary.reduce((sum, s) => sum + s.total, 0)
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Items grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {pdfData.items.map((item, i) => (
                    <div
                      key={i}
                      className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
                    >
                      <div className="p-4">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">
                          {item.description}
                        </h3>
                      </div>
                      {item.imageUrl ? (
                        <div className="px-4">
                          <img
                            src={item.imageUrl}
                            alt={item.description}
                            className="w-full h-48 object-contain rounded-lg border border-gray-200 bg-gray-50"
                          />
                        </div>
                      ) : (
                        <div className="mx-4 h-48 flex items-center justify-center rounded-lg bg-gray-50 border border-gray-200">
                          <span className="text-sm text-gray-400">[영수증 없음]</span>
                        </div>
                      )}
                      <div className="p-4 flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                          {formatDateShort(item.date)}
                        </span>
                        <span className="text-sm font-bold text-rose-600 tabular-nums">
                          {formatCurrency(item.expense)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
