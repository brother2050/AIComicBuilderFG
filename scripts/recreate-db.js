/**
 * 重新创建数据库脚本
 */
const Database = require('better-sqlite3');
const db = new Database('./data/comic.db');

// 删除旧表并重新创建（按依赖顺序）
db.exec(`
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS dialogues;
DROP TABLE IF EXISTS shots;
DROP TABLE IF EXISTS characters;
DROP TABLE IF EXISTS projects;
`);

// 创建项目表
db.exec(`
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  idea TEXT DEFAULT '',
  script TEXT DEFAULT '',
  style TEXT DEFAULT 'anime',
  aspect_ratio TEXT DEFAULT '16:9',
  status TEXT NOT NULL DEFAULT 'draft',
  final_video_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`);

// 创建角色表
db.exec(`
CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  visual_hint TEXT DEFAULT '',
  reference_image TEXT,
  scope TEXT NOT NULL DEFAULT 'main'
);
`);

// 创建分镜表
db.exec(`
CREATE TABLE shots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  scene_description TEXT DEFAULT '',
  start_frame_desc TEXT,
  end_frame_desc TEXT,
  motion_script TEXT,
  video_script TEXT,
  camera_direction TEXT DEFAULT 'static',
  duration INTEGER NOT NULL DEFAULT 10,
  first_frame TEXT,
  last_frame TEXT,
  video_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
);
`);

// 创建对白表
db.exec(`
CREATE TABLE dialogues (
  id TEXT PRIMARY KEY,
  shot_id TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
  character_name TEXT NOT NULL,
  text TEXT NOT NULL,
  emotion TEXT DEFAULT '',
  sequence INTEGER NOT NULL DEFAULT 0
);
`);

// 创建任务表
db.exec(`
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  payload TEXT,
  result TEXT,
  error TEXT,
  created_at INTEGER NOT NULL
);
`);

// 创建索引
db.exec(`
CREATE INDEX idx_characters_project ON characters(project_id);
CREATE INDEX idx_shots_project ON shots(project_id);
CREATE INDEX idx_dialogues_shot ON dialogues(shot_id);
CREATE INDEX idx_tasks_project ON tasks(project_id);
`);

console.log('Database recreated successfully!');
console.log('Tables created: projects, characters, shots, dialogues, tasks');

db.close();
