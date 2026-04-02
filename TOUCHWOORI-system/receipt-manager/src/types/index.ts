// ============================================
// 역할 및 상태 타입
// ============================================
export type Role = 'master' | 'sub_master' | 'accountant' | 'auditor' | 'teacher' | 'overseer' | 'admin_viewer';
export type UserStatus = 'pending' | 'active' | 'inactive';
export type ReceiptStatus = 'pending' | 'approved' | 'rejected';
export type LedgerType = 'main' | 'special';
export type EntrySource = 'receipt' | 'manual' | 'excel_import';
export type CategoryType = 'income' | 'expense';
export type ExcelSyncType = 'import' | 'export';
export type ExcelSyncStatus = 'success' | 'partial' | 'failed';

// ============================================
// 엔티티 타입
// ============================================
export interface User {
  id: string;
  email: string;
  name: string;
  department_id: string;
  position: string;
  role: Role | null;
  status: UserStatus;
  created_at: string;
}

export interface Position {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  keywords: string[];
  color: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface Ledger {
  id: string;
  department_id: string;
  name: string;
  type: LedgerType;
  description: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  ledger_id: string;
  receipt_id: string | null;
  category_id: string;
  date: string;
  description: string;
  income: number;
  expense: number;
  memo: string | null;
  source: EntrySource;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface LedgerEntryWithBalance extends LedgerEntry {
  balance: number;
  category?: Category;
}


export interface Receipt {
  id: string;
  department_id: string;
  category_id: string;
  submitted_by: string;
  status: ReceiptStatus;
  date: string;
  subtotal: number | null;
  discount: number | null;
  delivery_fee: number | null;
  final_amount: number;
  vendor: string | null;
  description: string;
  image_url: string | null;
  ocr_raw: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  memo: string | null;
  pdf_crop: PdfCrop | null;
  bank_name: string | null;
  account_holder: string | null;
  account_number: string | null;
  has_duplicate_warning: boolean | null;
  approved_amount: number | null;
  created_at: string;
  updated_at: string;
}

export interface AccountFavorite {
  id: string;
  user_id: string;
  label: string;
  bank_name: string;
  account_holder: string;
  account_number: string;
  created_at: string;
}

export interface ReceiptWithUser extends Receipt {
  submitter?: User;
  reviewer?: User;
  category?: Category;
}

export interface PdfCrop {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface Department {
  id: string;
  name: string;
  parent_id: string | null;
  type: 'education' | 'committee' | 'admin';
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface UserDepartment {
  user_id: string;
  department_id: string;
  created_at: string;
}

export interface ExcelSync {
  id: string;
  type: ExcelSyncType;
  filename: string;
  row_count: number;
  status: ExcelSyncStatus;
  error_log: string | null;
  created_by: string;
  created_at: string;
}

// ============================================
// OCR 결과 타입
// ============================================
export interface OcrResult {
  date: string | null;
  amount: number | null;
  vendor: string | null;
  rawText: string;
}

// ============================================
// API 응답 타입
// ============================================
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
