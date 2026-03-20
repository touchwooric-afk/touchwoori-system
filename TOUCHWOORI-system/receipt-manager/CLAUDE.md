# TOUCHWOORI 영수증 관리 시스템 — Claude 컨텍스트

## 프로젝트 개요
교회 고등부 재정 관리 시스템. 교사들이 영수증을 제출하면 회계교사가 검토·승인하고 장부에 자동 연동. 결산 시 PDF로 지출증빙 자료를 출력한다.

## 기술 스택
- **Frontend/Backend**: Next.js 15 (App Router, TypeScript)
- **DB/Auth**: Supabase (PostgreSQL + RLS)
- **스타일**: Tailwind CSS v4
- **PDF**: @react-pdf/renderer (클라이언트 렌더링)
- **OCR**: Tesseract.js (브라우저)
- **이미지 압축**: browser-image-compression
- **엑셀**: xlsx

## 역할 체계 (Role)
| Role | 권한 |
|------|------|
| `master` | 전체 관리 (사용자 승인, 카테고리/직분/결산기 관리) |
| `accountant` | 영수증 승인, 장부 관리, 결산 PDF |
| `teacher` | 영수증 제출, 내 제출 내역 조회, 장부 조회 |

## 핵심 설계 결정
1. **RLS 우회**: 교사의 `ledger_entries` UPDATE/DELETE는 RLS가 차단 → API에서 권한 검증 후 `createServiceClient()`로 우회
2. **잔액 계산**: DB 미저장, 페이지별 누적 합산으로 계산
3. **영수증 승인 플로우**:
   - 교사 업로드 → 후보 장부항목 매칭(금액100pt/항목명50pt/날짜근접10pt) → 선택 연동 또는 미연동 제출
   - 회계교사 승인 시: 이미 연동됐으면 상태만 변경 / 미연동이면 새 항목 추가 or 기존 항목 선택
4. **중복 영수증 차단**: 같은 부서+날짜+금액 조합 하드블록 (link 모드는 skip)
5. **PDF**: 요약표(1페이지) + 영수증 2×2 그리드, EXIF 자동 회전(canvas), 1페이지 남는 공간에 영수증 자동 채움
6. **이미지 삭제**: `receipts` 테이블 DELETE 시 Storage도 삭제, `ledger_entries` FK 먼저 null 처리

## 디렉토리 구조
```
src/
├── app/
│   ├── api/                    # API 라우트
│   │   ├── auth/               # 회원가입, 비밀번호 재설정
│   │   ├── categories/         # 카테고리 CRUD
│   │   ├── excel/              # 가져오기/내보내기
│   │   ├── ledgers/[id]/entries/ # 장부 항목 CRUD
│   │   ├── pdf/                # PDF 데이터 생성
│   │   ├── receipts/           # 영수증 CRUD + 승인/반려
│   │   │   ├── candidates/     # 장부 항목 매칭 후보
│   │   │   └── [id]/approve|reject/
│   │   ├── settlements/        # 결산기 관리
│   │   └── users/              # 사용자 관리
│   ├── excel/
│   │   ├── page.tsx            # 엑셀 가져오기 (accountant/master)
│   │   └── export/page.tsx     # 엑셀 내보내기 전용
│   ├── ledger/
│   │   ├── page.tsx            # 장부 조회 (필터, 누적잔액, 엑셀가져오기버튼)
│   │   └── manage/page.tsx     # 장부 생성/관리
│   ├── master/                 # 시스템 관리 (master only)
│   ├── receipts/
│   │   ├── my/page.tsx         # 내 제출 내역
│   │   ├── new/page.tsx        # 직접 입력 (accountant/master)
│   │   ├── pending/page.tsx    # 승인 대기 목록
│   │   ├── submit/page.tsx     # 단건 제출 (모바일)
│   │   └── upload/page.tsx     # 일괄 업로드 + OCR + 장부 연동
│   └── settlements/
│       ├── page.tsx            # 결산 PDF 생성/다운로드
│       └── history/page.tsx    # 결산 이력
├── components/
│   ├── layout/                 # AppShell, Sidebar, BottomTabs
│   └── ui/                     # Button, Modal, Toast, etc.
├── hooks/                      # useUser, useToast, useHotkey
├── lib/                        # supabase, format, ocr, image, excel, pdf
└── middleware.ts               # 라우트 가드
```

## 주요 API 패턴
- 모든 mutation: API 라우트 경유 (Supabase RLS + API 레벨 이중 검증)
- 교사의 `ledger_entries` 수정/삭제: `createServiceClient()` 사용
- 영수증 삭제: `createServiceClient()`로 FK 해제 후 삭제

## 알려진 제약사항
- OCR 정확도: 한국어 영수증 파싱은 이미지 품질에 따라 편차 있음
- PDF 이미지 회전: canvas EXIF 보정으로 처리, 일부 포맷 미지원 가능
- Supabase 무료 플랜: Storage 1GB, DB 500MB 제한
