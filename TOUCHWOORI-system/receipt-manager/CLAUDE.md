# TOUCHWOORI 영수증 관리 시스템 — 개발 컨텍스트

> 이 문서는 AI 및 신규 개발자가 프로젝트를 즉시 파악하고 작업할 수 있도록 작성된 기술 레퍼런스입니다.
> 마지막 업데이트: 2026-03-27

---

## 프로젝트 개요

교회 고등부 재정 관리 시스템. 교사들이 영수증을 제출하면 회계교사가 검토·승인하고 장부에 자동 연동. 결산 시 PDF로 지출증빙 자료를 출력한다.

**레포지토리**: `touchwooric-afk/touchwoori-system`
**작업 디렉토리**: `/TOUCHWOORI-system/receipt-manager`
**로컬 실행**: `npm run dev` (포트 3001)

---

## 기술 스택

| 항목 | 기술 |
|------|------|
| Frontend/Backend | Next.js 15 (App Router, TypeScript) |
| DB/Auth | Supabase (PostgreSQL + RLS) |
| 스타일 | Tailwind CSS v4 (`@theme` in globals.css) |
| PDF | `@react-pdf/renderer` (클라이언트 렌더링) |
| OCR | `tesseract.js` (브라우저 실행) |
| 이미지 압축 | `browser-image-compression` |
| 엑셀 | `xlsx` |

---

## 역할 체계 (Role)

| Role | 권한 요약 |
|------|-----------|
| `master` | 전체 관리 (사용자 승인, 카테고리·직분 관리, 장부, 결산) |
| `sub_master` | 사용자 관리·역할 부여 전담. 재정 기능 없음. master 계정 수정 불가 |
| `accountant` | 영수증 승인, 장부 편집, 결산 PDF, 카테고리 관리 |
| `auditor` | 전체 부서 장부·영수증 열람 전용 (쓰기 불가) |
| `teacher` | 영수증 제출, 내 제출 내역, 장부 조회 |

**isEditor 패턴** (장부 편집 권한 체크):
```ts
const isEditor = user?.role === 'master' || user?.role === 'accountant' || user?.role === 'sub_master';
```

---

## 디렉토리 구조

```
src/
├── app/
│   ├── api/
│   │   ├── auth/                    # 회원가입, 비밀번호 재설정
│   │   ├── categories/              # 카테고리 CRUD (master + accountant)
│   │   ├── dashboard/               # 대시보드 차트 데이터
│   │   ├── excel/                   # 엑셀 가져오기/내보내기
│   │   ├── ledgers/[id]/entries/    # 장부 항목 CRUD
│   │   ├── pdf/                     # PDF용 데이터 집계
│   │   ├── receipts/                # 영수증 CRUD
│   │   │   ├── [id]/approve/        # 영수증 승인
│   │   │   ├── [id]/reject/         # 영수증 반려
│   │   │   ├── [id]/resubmit/       # 반려 후 재제출
│   │   │   ├── candidates/          # 장부 항목 매칭 후보
│   │   │   └── check-similar/       # 중복 감지
│   │   ├── account-favorites/       # 자주 쓰는 계좌 즐겨찾기
│   │   └── users/                   # 사용자 관리
│   ├── excel/
│   │   ├── page.tsx                 # 엑셀 가져오기
│   │   └── export/page.tsx          # 엑셀 내보내기
│   ├── ledger/
│   │   ├── page.tsx                 # 장부 조회 (필터, 누적잔액, 카테고리 클릭필터)
│   │   └── manage/page.tsx          # 장부 생성·관리
│   ├── master/
│   │   ├── users/page.tsx           # 사용자 관리
│   │   ├── categories/page.tsx      # 카테고리 관리
│   │   └── positions/page.tsx       # 직분 관리
│   ├── receipts/
│   │   ├── my/page.tsx              # 내 제출 내역 (accountant/master는 제출자 표시)
│   │   ├── new/page.tsx             # 직접 입력 (accountant/master)
│   │   ├── pending/page.tsx         # 미승인 영수증
│   │   ├── submit/page.tsx          # 단건 제출 (모바일 최적화)
│   │   ├── upload/page.tsx          # 일괄 업로드 + OCR
│   │   └── [id]/page.tsx            # 영수증 상세
│   └── settlements/
│       ├── page.tsx                 # 결산 및 지출증빙 PDF 생성/다운로드
│       └── summary/page.tsx         # 기간별 카테고리 합산
├── components/
│   ├── dashboard/DashboardClient.tsx  # 대시보드 (역할별 통계, 차트, 부서 로고)
│   ├── layout/
│   │   ├── AppShell.tsx             # 전체 레이아웃 (사이드바 w-64 기준)
│   │   ├── Sidebar.tsx              # PC 사이드바 (배지 포함)
│   │   └── BottomTabs.tsx           # 모바일 하단 탭
│   └── ui/                          # Button, Modal, Toast, ConfirmDialog, etc.
├── hooks/
│   ├── useUser.ts                   # 현재 로그인 사용자 컨텍스트
│   ├── useToast.ts
│   └── useShortcutKey.ts
├── lib/
│   ├── supabase.ts                  # 브라우저/서버/서비스 클라이언트
│   ├── auth.ts                      # getCurrentUser()
│   ├── format.ts                    # formatCurrency, formatDate 등
│   ├── ocr.ts                       # Tesseract.js 한국어 파싱
│   ├── imagePreprocess.ts           # 이미지 압축·리사이즈
│   └── excel.ts                     # xlsx 가져오기/내보내기
├── types/index.ts                   # 전체 TypeScript 타입 정의
└── middleware.ts                    # 라우트 가드 (역할별 접근 제어)
```

---

## 핵심 설계 결정

### 1. RLS 우회
교사의 `ledger_entries` UPDATE/DELETE는 Supabase RLS가 차단 → API 라우트에서 권한 검증 후 `createServiceClient()`로 실행.
영수증 삭제 시 Storage 파일 삭제도 동일하게 `createServiceClient()` 사용.

### 2. 잔액 계산
DB에 저장하지 않고, API에서 `SUM(income - expense)`를 페이지 오프셋 기준으로 누적 계산하여 반환.

### 3. 영수증 승인 플로우
```
교사 업로드
  → OCR 자동 파싱 (날짜/금액/업체명)
  → 장부 항목 후보 매칭 (금액100pt + 항목명유사도50pt + 날짜근접10pt)
  → 선택: 연동 제출 or 미연동 제출

회계교사 승인 시:
  → 이미 연동된 항목 → 상태만 approved로 변경
  → 미연동 → 새 항목 추가 or 기존 항목 선택 연동
```

### 4. 중복 영수증 차단
같은 `department_id + date + final_amount` 조합 하드블록. 장부 연동(link) 모드는 skip.

### 5. PDF 생성
- 1페이지: 수입/지출 결산표 + 남는 공간에 영수증 자동 채움
- 2페이지~: 영수증 2×2 그리드
- 이미지: canvas EXIF 자동 회전 + 최대 1200px / quality 0.75 압축 (파일 크기 절감)

### 6. 부서 로고
- Supabase Storage `department-banners` 버킷 (Public)
- 파일명: 영문 슬러그 (한국어 미지원) — 예: `고등부` → `godeungbu.png`
- 매핑: `DashboardClient.tsx` 상단 `DEPARTMENT_BANNER_MAP` 객체에 등록
- 없으면 그라디언트 폴백

---

## 사이드바 메뉴 구조 (현재)

| 그룹 | 메뉴 | 권한 |
|------|------|------|
| 홈 | 대시보드 | 전체 |
| 시스템 관리 | 사용자/카테고리/직분 관리 | master |
| 운영 | 사용자 관리 | sub_master |
| 영수증 | 영수증 제출, 내 제출 내역 | teacher/accountant/master |
| 영수증 | 미승인 영수증, 직접 입력 | accountant/master |
| 회계장부 | 회계장부 조회 | 전체 |
| 회계장부 | 장부 관리, 엑셀 내보내기 | accountant/master |
| 결산 | 결산 및 지출증빙 | 전체 |

> auditor/sub_master는 영수증 제출/승인 메뉴 없음

---

## DB 스키마 (주요 테이블)

| 테이블 | 주요 컬럼 |
|--------|-----------|
| `users` | id, email, name, department_id (TEXT, 기본 '고등부'), position, role, status |
| `positions` | id, name, sort_order, is_active |
| `categories` | id, name, type (income/expense), keywords[], color, sort_order, is_active |
| `ledgers` | id, department_id, name, type (main/special), is_active, created_by |
| `ledger_entries` | id, ledger_id, receipt_id (nullable), category_id, date, description, income, expense, source (receipt/manual/excel_import) |
| `receipts` | id, department_id, submitted_by, status (pending/approved/rejected), date, final_amount, approved_amount, image_url, has_duplicate_warning, bank_name, account_holder, account_number |
| `account_favorites` | id, user_id, label, bank_name, account_holder, account_number |

**마이그레이션 파일** (`supabase/migrations/`):
- `001_initial_schema.sql` — 기본 스키마 + RLS + 인덱스
- `003_account_favorites.sql` — 계좌 즐겨찾기
- `004_duplicate_warning.sql` — has_duplicate_warning 컬럼
- `005_approved_amount.sql` — approved_amount 컬럼
- `007_categories_accountant_access.sql` — 카테고리 RLS accountant 허용

---

## Supabase Storage 버킷

| 버킷 | 용도 | 접근 |
|------|------|------|
| `receipt-images` | 영수증 이미지 | Private (RLS) |
| `department-banners` | 부서 로고 이미지 | Public |

---

## 주요 API 패턴

```ts
// 권한 검증 패턴 (모든 API 라우트 공통)
const { data: { user: authUser } } = await supabase.auth.getUser();
const { data: profile } = await supabase.from('users').select('role, department_id').eq('id', authUser.id).single();

// RLS 우회가 필요한 경우
const serviceClient = createServiceClient();
await serviceClient.from('ledger_entries').update(...).eq('id', id);
```

---

## 알려진 제약사항 및 주의사항

- **Tailwind v4**: `tailwind.config.ts` 없음. 커스텀 색상은 `src/app/globals.css`의 `@theme` 블록에 정의
- **OCR**: 한국어 영수증 파싱 정확도는 이미지 품질에 따라 편차 있음
- **PDF 이미지**: canvas EXIF 보정 처리, 일부 포맷 미지원 가능
- **Supabase 무료 플랜**: Storage 1GB, DB 500MB 제한
- **Storage 파일명**: 한국어 파일명 업로드 불가 → 영문 슬러그 사용

---

## 미구현 백로그

- PDF 양식 기반 온라인 작성 페이지 (감사 자료 제출용, 사용자가 PDF 양식 제공 예정)
