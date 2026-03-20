-- ============================================
-- 초기 시드 데이터
-- Supabase SQL Editor에서 마이그레이션 실행 후 이 파일 실행
-- ============================================

-- 기본 직분 5종
INSERT INTO positions (name, sort_order) VALUES
  ('교사', 1),
  ('부장교사', 2),
  ('총무교사', 3),
  ('회계교사', 4),
  ('담당교역자', 5)
ON CONFLICT (name) DO NOTHING;

-- 기본 카테고리 9종 (수입 4 + 지출 5)
INSERT INTO categories (name, type, keywords, color, sort_order) VALUES
  ('교육위원회', 'income', '["교육위원회", "지원금"]', '#3B82F6', 1),
  ('수련회지원비', 'income', '["수련회", "지원"]', '#8B5CF6', 2),
  ('이자', 'income', '["이자"]', '#06B6D4', 3),
  ('찬양팀 운영', 'expense', '["찬양", "악기", "음향"]', '#F59E0B', 4),
  ('교육행사비', 'expense', '["수련회", "행사", "전도축제"]', '#EF4444', 5),
  ('간식비', 'expense', '["간식", "식사", "음료", "커피", "식비"]', '#EC4899', 6),
  ('비품비', 'expense', '["비품", "사무용품", "문구"]', '#6366F1', 7),
  ('기타 수입', 'income', '[]', '#9CA3AF', 8),
  ('기타 지출', 'expense', '[]', '#6B7280', 9)
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- 전체회기 장부는 master 계정 생성 후 아래 SQL 실행:
--
-- INSERT INTO ledgers (department_id, name, type, created_by)
-- VALUES ('고등부', '전체회기', 'main', '<MASTER_USER_UUID>');
-- ============================================
