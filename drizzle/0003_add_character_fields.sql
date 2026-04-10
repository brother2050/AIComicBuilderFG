-- 添加角色视觉描述和集数字段
ALTER TABLE characters ADD COLUMN visual_description TEXT DEFAULT '';
ALTER TABLE characters ADD COLUMN episode INTEGER DEFAULT 1;
