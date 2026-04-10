-- 添加模板描述、系统提示和默认标识字段，并重建表以修正列结构
CREATE TABLE templates_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  type TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  is_default INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO templates_new SELECT id, name, description, type, COALESCE(system_prompt, content), project_id, is_default, created_at, updated_at FROM templates;
DROP TABLE templates;
ALTER TABLE templates_new RENAME TO templates;
CREATE INDEX idx_templates_project ON templates(project_id);
CREATE INDEX idx_templates_type ON templates(type);
