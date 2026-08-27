import JSZip from 'jszip';

const TEMPLATE_URL = '/templates/touchwoori-high-monthly-plan.hwpx';
const SECTION_PATH = 'Contents/section0.xml';
const REPORT_TITLE = '◎ 터치우리 고등부 7월 재정보고';
const PLAN_TITLE = '■ 한우리 BCM교회 터치우리 고등부 8월 계획서';
const REPORT_INCOME_SLOTS = 6;
const REPORT_EXPENSE_SLOTS = 6;

interface SummaryItem {
  category: string;
  total: number;
}

export interface MonthlyPlanHwpXInput {
  settlementYear: number;
  settlementMonth: number;
  carryoverBalance: number;
  totalIncome: number;
  totalExpense: number;
  endingBalance: number;
  incomeSummary: SummaryItem[];
  expenseSummary: SummaryItem[];
}

interface ReportRow {
  label: string;
  amount: number;
}

interface TemplateReplacement {
  source: string;
  target: string;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatAmount(amount: number) {
  return Math.round(amount).toLocaleString('ko-KR');
}

function replaceFirstTextNode(xml: string, source: string, target: string) {
  const pattern = new RegExp(
    `(<hp:t(?:\\s[^>]*)?>)${escapeRegex(escapeXml(source))}(</hp:t>)`
  );

  if (!pattern.test(xml)) {
    throw new Error(`양식에서 \"${source}\" 항목을 찾지 못했습니다`);
  }

  return xml.replace(pattern, `$1${escapeXml(target)}$2`);
}

function replacePlanCalendar(xml: string, settlementYear: number, settlementMonth: number) {
  const reportIndex = xml.indexOf(REPORT_TITLE);
  if (reportIndex < 0) {
    throw new Error('양식에서 재정보고 영역을 찾지 못했습니다');
  }

  const planDate = new Date(settlementYear, settlementMonth, 1);
  const planYear = planDate.getFullYear();
  const planMonth = planDate.getMonth() + 1;
  const sundays = getSundays(planYear, planMonth);
  let planSection = xml.slice(0, reportIndex);
  const reportSection = xml.slice(reportIndex);
  const clearFifthWeek = sundays.length < 5;
  let weekIndex = 0;
  let dateIndex = 0;

  if (clearFifthWeek) {
    const fifthWeekLabel = '<hp:t>3주</hp:t>';
    const fifthWeekStart = planSection.lastIndexOf(fifthWeekLabel);
    if (fifthWeekStart < 0) {
      throw new Error('양식에서 5주차 행을 찾지 못했습니다');
    }
    planSection = `${planSection.slice(0, fifthWeekStart)}<hp:t>__TOUCHWOORI_EMPTY_WEEK__</hp:t>${planSection.slice(fifthWeekStart + fifthWeekLabel.length)}`;
  }

  planSection = planSection.replace(
    /(<hp:t(?:\s[^>]*)?>)(?:[1-5]주\s?)(<\/hp:t>)/g,
    (_match, openTag, closeTag) => {
      const text = weekIndex < sundays.length ? `${weekIndex + 1}주` : '';
      weekIndex += 1;
      return `${openTag}${text}${closeTag}`;
    }
  );

  planSection = planSection.replace(
    /(<hp:t(?:\s[^>]*)?>)(?:[1-3]?\d일)(<\/hp:t>)/g,
    (_match, openTag, closeTag) => {
      const text = dateIndex < sundays.length ? `${sundays[dateIndex]}일` : '';
      dateIndex += 1;
      return `${openTag}${text}${closeTag}`;
    }
  );

  if (weekIndex !== (clearFifthWeek ? 4 : 5) || dateIndex !== 5) {
    throw new Error('양식의 주차 또는 날짜 칸 수가 예상과 다릅니다');
  }

  if (clearFifthWeek) {
    const markerIndex = planSection.indexOf('__TOUCHWOORI_EMPTY_WEEK__');
    const emptyWeekStart = planSection.lastIndexOf('<hp:t', markerIndex);
    const emptyWeekEnd = planSection.indexOf('잔액:', markerIndex);
    if (emptyWeekStart < 0 || emptyWeekEnd < 0) {
      throw new Error('양식에서 비워야 할 5주차 행을 찾지 못했습니다');
    }

    const emptyWeek = planSection
      .slice(emptyWeekStart, emptyWeekEnd)
      .replace(/(<hp:t(?:\s[^>]*)?>)[^<]*(<\/hp:t>)/g, '$1$2');
    planSection = `${planSection.slice(0, emptyWeekStart)}${emptyWeek}${planSection.slice(emptyWeekEnd)}`;
  }

  return {
    xml: `${planSection}${reportSection}`,
    planYear,
    planMonth,
  };
}

function getSundays(year: number, month: number) {
  const days: number[] = [];
  const lastDay = new Date(year, month, 0).getDate();

  for (let day = 1; day <= lastDay; day += 1) {
    if (new Date(year, month - 1, day).getDay() === 0) {
      days.push(day);
    }
  }

  return days;
}

function fitRows(items: SummaryItem[], slots: number): ReportRow[] {
  if (items.length <= slots) {
    return items.map((item) => ({ label: item.category, amount: item.total }));
  }

  const visible = items.slice(0, slots - 1).map((item) => ({
    label: item.category,
    amount: item.total,
  }));
  const remaining = items.slice(slots - 1).reduce((sum, item) => sum + item.total, 0);

  return [...visible, { label: '기타', amount: remaining }];
}

function padRows(rows: ReportRow[], slots: number) {
  return Array.from({ length: slots }, (_, index) => rows[index] || { label: '', amount: 0 });
}

function replaceReportRows(
  xml: string,
  incomeRows: ReportRow[],
  expenseRows: ReportRow[],
  input: MonthlyPlanHwpXInput
) {
  const reportIndex = xml.indexOf(REPORT_TITLE);
  if (reportIndex < 0) {
    throw new Error('양식에서 재정보고 제목을 찾지 못했습니다');
  }

  const originalIncomeRows: ReportRow[] = [
    { label: '전월이월금', amount: 947987 },
    { label: '후원금', amount: 1150000 },
    { label: '교육위원회', amount: 500000 },
    { label: '이자', amount: 132 },
    { label: '수련회 수입', amount: 740000 },
    { label: '캐시백', amount: 3300 },
  ];
  const originalExpenseRows: ReportRow[] = [
    { label: '수련회 지출', amount: 1163440 },
    { label: '찬양팀 운영', amount: 295800 },
    { label: '비품비', amount: 24000 },
    { label: '간식비', amount: 23170 },
  ];
  const replacements: TemplateReplacement[] = [];

  originalIncomeRows.forEach((row, index) => {
    replacements.push({ source: row.label, target: incomeRows[index].label });
    replacements.push({ source: formatAmount(row.amount), target: incomeRows[index].label ? formatAmount(incomeRows[index].amount) : '' });

    if (index < originalExpenseRows.length) {
      const expense = originalExpenseRows[index];
      replacements.push({ source: expense.label, target: expenseRows[index].label });
      replacements.push({ source: formatAmount(expense.amount), target: expenseRows[index].label ? formatAmount(expenseRows[index].amount) : '' });
    }
  });

  replacements.push(
    { source: '합   계', target: '합   계' },
    { source: '3,341,419', target: formatAmount(input.carryoverBalance + input.totalIncome) },
    { source: '합   계', target: '합   계' },
    { source: '1,506,410', target: formatAmount(input.totalExpense) },
    { source: '잔   액', target: '잔   액' },
    { source: '1,835,009', target: formatAmount(input.endingBalance) }
  );

  let cursor = reportIndex;
  let output = xml;

  for (const { source, target } of replacements) {
    const pattern = new RegExp(
      `(<hp:t(?:\\s[^>]*)?>)${escapeRegex(escapeXml(source))}(</hp:t>)`
    );
    const tail = output.slice(cursor);
    const match = pattern.exec(tail);

    if (!match || match.index === undefined) {
      throw new Error(`양식에서 재정보고 \"${source}\" 항목을 찾지 못했습니다`);
    }

    const replacement = `${match[1]}${escapeXml(target)}${match[2]}`;
    const start = cursor + match.index;
    output = `${output.slice(0, start)}${replacement}${output.slice(start + match[0].length)}`;
    cursor = start + replacement.length;
  }

  return output;
}

export function buildMonthlyPlanSectionXml(input: MonthlyPlanHwpXInput, sectionXml: string) {
  if (input.settlementMonth < 1 || input.settlementMonth > 12) {
    throw new Error('결산 월이 올바르지 않습니다');
  }

  const { xml: calendarUpdated, planYear, planMonth } = replacePlanCalendar(
    sectionXml,
    input.settlementYear,
    input.settlementMonth
  );
  const incomeRows = padRows(
    [
      { label: '전월이월금', amount: input.carryoverBalance },
      ...fitRows(input.incomeSummary, REPORT_INCOME_SLOTS - 1),
    ],
    REPORT_INCOME_SLOTS
  );
  const expenseRows = padRows(fitRows(input.expenseSummary, REPORT_EXPENSE_SLOTS), REPORT_EXPENSE_SLOTS);
  let updated = replaceReportRows(calendarUpdated, incomeRows, expenseRows, input);

  updated = replaceFirstTextNode(
    updated,
    PLAN_TITLE,
    `■ 한우리 BCM교회 터치우리 고등부 ${planMonth}월 계획서`
  );
  updated = replaceFirstTextNode(
    updated,
    '● 8월 생일축하',
    `● ${planMonth}월 생일축하`
  );
  updated = replaceFirstTextNode(
    updated,
    '잔액: 1,835,000',
    `잔액: ${formatAmount(input.endingBalance)}`
  );
  updated = replaceFirstTextNode(
    updated,
    REPORT_TITLE,
    `◎ 터치우리 고등부 ${input.settlementMonth}월 재정보고`
  );

  return { sectionXml: updated, planYear, planMonth };
}

export async function generateMonthlyPlanHwpX(input: MonthlyPlanHwpXInput) {
  const response = await fetch(TEMPLATE_URL, { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error('계획서 양식을 불러오지 못했습니다');
  }

  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const sectionFile = zip.file(SECTION_PATH);
  if (!sectionFile) {
    throw new Error('계획서 양식의 본문을 찾지 못했습니다');
  }

  const { sectionXml, planYear, planMonth } = buildMonthlyPlanSectionXml(
    input,
    await sectionFile.async('string')
  );
  zip.file(SECTION_PATH, sectionXml);

  const mimetype = zip.file('mimetype');
  if (mimetype) {
    zip.file('mimetype', await mimetype.async('string'), { compression: 'STORE' });
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return {
    blob,
    filename: `${planYear} 터치우리 고등부 ${planMonth}월 계획서.hwpx`,
    planYear,
    planMonth,
  };
}
