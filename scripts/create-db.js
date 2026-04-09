const Database = require('better-sqlite3');
const path = require('path');

// 确保data目录存在
const fs = require('fs');
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database('./data/comic.db');

// 创建表
db.exec(`
CREATE TABLE IF NOT EXISTS projects (
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

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  visual_hint TEXT DEFAULT '',
  reference_image TEXT,
  scope TEXT NOT NULL DEFAULT 'main'
);

CREATE TABLE IF NOT EXISTS shots (
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

CREATE TABLE IF NOT EXISTS dialogues (
  id TEXT PRIMARY KEY,
  shot_id TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
  character_name TEXT NOT NULL,
  text TEXT NOT NULL,
  emotion TEXT DEFAULT '',
  sequence INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payload TEXT,
  result TEXT,
  error TEXT,
  created_at INTEGER NOT NULL
);
`);

console.log('Database tables created successfully');
db.close();
