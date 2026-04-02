/**
 * 부서 목록 중앙 관리
 *
 * 부서를 추가할 때는 이 파일과 DB `departments` 테이블에만 추가하면 됩니다.
 * 코드 전역에서 이 배열을 import해 사용하세요.
 */

export interface DepartmentDef {
  id: string;             // DB 기본키 & users.department_id 값
  name: string;           // 표시명
  type: 'education' | 'committee' | 'admin';
  sortOrder: number;
}

export const DEPARTMENTS: DepartmentDef[] = [
  { id: '고등부', name: '터치우리 고등부', type: 'education', sortOrder: 1 },
  { id: '중등부', name: '드림우리 중등부', type: 'education', sortOrder: 2 },
];

/** id → name 빠른 조회 */
export const DEPARTMENT_MAP: Record<string, string> = Object.fromEntries(
  DEPARTMENTS.map((d) => [d.id, d.name])
);

/** 활성 부서 id 목록 */
export const DEPARTMENT_IDS = DEPARTMENTS.map((d) => d.id);
