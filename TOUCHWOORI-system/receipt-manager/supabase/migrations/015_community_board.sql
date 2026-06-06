-- 공용 소통 게시판
CREATE TABLE board_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 10000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE board_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_board_posts_created_at ON board_posts(created_at DESC);
CREATE INDEX idx_board_posts_author ON board_posts(author_id, created_at DESC);
CREATE INDEX idx_board_comments_post ON board_comments(post_id, created_at ASC);

CREATE TRIGGER board_posts_updated_at
  BEFORE UPDATE ON board_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER board_comments_updated_at
  BEFORE UPDATE ON board_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE board_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "active_users_read_board_posts" ON board_posts FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND status = 'active')
);

CREATE POLICY "active_users_create_board_posts" ON board_posts FOR INSERT WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND status = 'active')
);

CREATE POLICY "authors_update_board_posts" ON board_posts FOR UPDATE USING (
  author_id = auth.uid()
) WITH CHECK (author_id = auth.uid());

CREATE POLICY "authors_delete_board_posts" ON board_posts FOR DELETE USING (
  author_id = auth.uid()
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND status = 'active' AND role = 'master')
);

CREATE POLICY "active_users_read_board_comments" ON board_comments FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND status = 'active')
);

CREATE POLICY "active_users_create_board_comments" ON board_comments FOR INSERT WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND status = 'active')
);

CREATE POLICY "authors_update_board_comments" ON board_comments FOR UPDATE USING (
  author_id = auth.uid()
) WITH CHECK (author_id = auth.uid());

CREATE POLICY "authors_delete_board_comments" ON board_comments FOR DELETE USING (
  author_id = auth.uid()
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND status = 'active' AND role = 'master')
);
