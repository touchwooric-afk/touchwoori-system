# TOUCHWOORI 영수증 관리 시스템 PRD

## 1. 서비스 개요

### 목적
교회 고등부의 재정 집행 투명성 확보. 교사들이 지출한 영수증을 디지털로 제출하고, 회계교사가 검토·승인하여 장부에 자동 연동. 결산 시 감사 대비 지출증빙 PDF를 생성한다.

### 사용자
| 역할 | 설명 |
|------|------|
| master | 총무/담당자. 시스템 전체 관리 |
| accountant | 회계교사. 영수증 승인, 장부 관리 |
| teacher | 일반교사. 영수증 제출, 조회 |

---

## 2. 기능 명세

### 2.1 인증
- 이메일/비밀번호 로그인
- 회원가입 시 `pending` 상태로 생성 → master 승인 필요
- 비밀번호 재설정 (이메일 링크)
- 역할별 라우트 가드 (middleware.ts)

### 2.2 사용자 관리 (master)
- 가입 신청자 승인/거절
- 역할 변경 (teacher ↔ accountant)
- 계정 비활성화
- 직분 관리 (목사, 전도사, 장로, 권사, 집사 등 커스텀)

### 2.3 카테고리 관리 (master)
- 수입/지출 카테고리 CRUD
- 카테고리별 키워드 설정 (OCR/엑셀 자동 매칭용)
- 색상 지정

### 2.4 영수증 제출 (전체)
- **단건 제출** (`/receipts/submit`): 모바일 최적화, 사진 업로드
- **일괄 업로드** (`/receipts/upload`): 다중 파일 + OCR 자동 파싱
  - OCR: 날짜, 금액, 업체명 자동 추출
  - 이미지 압축: 업로드 전 1200px/80% 자동 압축
  - 장부 항목 매칭: 금액(100pt) + 항목명 유사도(50pt) + 날짜근접(최대10pt)
  - 교사도 기존 장부 항목에 연동 가능
- **중복 감지**: 같은 부서+날짜+금액 하드블록 (link 모드 제외)
- **날짜 자동 동기화**: 장부 항목 연동 시 해당 항목의 날짜로 자동 변경

### 2.5 영수증 승인 (accountant/master)
- 미승인 목록 조회 및 일괄 승인
- 개별 승인 시 처리 방식 선택:
  - **새 항목 추가**: 날짜/항목명/금액/카테고리 수정 가능
  - **기존 항목 연동**: 미연동 장부 항목 선택
  - **이미 연동됨**: 자동 감지, 상태만 변경
- 반려 (사유 입력)

### 2.6 장부 (전체 조회 / accountant·master 편집)
- 다중 장부 지원 (본 장부 + 특수 장부)
- 항목별 누적 잔액 표시
- 필터: 기간, 카테고리, 검색어, 영수증 연동 여부
- 다중 항목 일괄 입력 모달
- 24시간 내 신규 항목 NEW 배지 + 연한 배경 표시
- 영수증 이미지 미리보기 (항목 클릭)
- 엑셀 내보내기 (현재 필터 그대로 적용)
- 엑셀 가져오기 버튼 → `/excel` 이동

### 2.7 결산 PDF
- 기간 선택: 직접 입력 / 전반기(12~4월) / 후반기(5~11월) / 저장된 결산기
- 페이지 구성:
  - 1페이지: 카테고리별 지출 합계표 + 남는 공간에 영수증 자동 채움
  - 2페이지~: 영수증 2×2 그리드 (이미지 EXIF 자동 회전)
- 브라우저에서 미리보기 후 PDF 다운로드

### 2.8 엑셀 연동
- **내보내기** (`/excel/export`): 장부 선택 + 기간 필터 → xlsx 다운로드
- **가져오기** (`/excel`): xlsx 업로드 → 행별 카테고리 매칭 미리보기 → 확인 후 장부에 임포트

### 2.9 결산 이력
- 저장된 결산기 목록
- 해당 결산기로 PDF 페이지 바로 이동

---

## 3. 화면 구조

### 사이드바 메뉴
| 그룹 | 메뉴 | 권한 |
|------|------|------|
| 홈 | 대시보드 | 전체 |
| 시스템 관리 | 사용자/카테고리/직분/결산기 관리 | master |
| 영수증 | 영수증 제출, 내 제출 내역 | 전체 |
| 영수증 | 미승인 영수증, 직접 입력 | accountant/master |
| 장부 | 장부 조회 | 전체 |
| 장부 | 장부 관리 | accountant/master |
| 결산 | 결산 PDF, 결산 이력 | 전체 |
| 결산 | 엑셀 내보내기 | accountant/master |

### 모바일 하단 탭
- master: 홈 / 관리 / 장부 / 결산
- accountant: 홈 / 미승인 / 장부 / 결산
- teacher: 홈 / 제출 / 내역 / 장부

---

## 4. 데이터 모델 (주요 테이블)

| 테이블 | 설명 |
|--------|------|
| `users` | 사용자 (role, status, department_id, position) |
| `positions` | 직분 (name) |
| `categories` | 카테고리 (name, type: income/expense, keywords, color) |
| `ledgers` | 장부 (name, type: main/special, is_active, department_id) |
| `ledger_entries` | 장부 항목 (date, description, income, expense, receipt_id, source: manual/receipt) |
| `receipts` | 영수증 (date, description, final_amount, image_url, status: pending/approved/rejected, submitted_by) |
| `settlements` | 결산기 (title, start_date, end_date) |

---

## 5. 변경 이력

### 2026-03-20 — 현재 버전 (Phase 1 완성)
- 영수증 승인 플로우 개선: 새 항목/기존 항목 선택 모달
- 교사 영수증 제출 시 장부 항목 매칭 및 연동 기능
- 중복 영수증 하드블록 (동일 부서+날짜+금액)
- 장부 항목 신규 표시 (NEW 배지, 24시간)
- 영수증 source 무관 삭제 가능
- 제출자명 표시 버그 수정 (Supabase join alias)
- RLS 우회: 교사의 ledger_entries 수정/삭제에 serviceClient 적용
- 결산 PDF: EXIF 자동 회전, 빈 페이지 제거, 1페이지 영수증 자동 채움
- 결산 기간 기본값 자동 설정 (현재 반기)
- 메뉴 정리: 결산 조회 제거, 엑셀 내보내기 전용 페이지 분리
- Git 초기화 및 GitHub push (touchwooric-afk/touchwoori-system)
