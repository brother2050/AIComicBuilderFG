# AI Comic Builder FG

AI 漫剧生成器 - 基于 AI 的分镜漫画/动画视频自动生成系统。

## 功能概述

通过输入故事想法，自动完成从剧本到视频的完整生成流水线：

1. **剧本生成** - 根据想法生成完整剧本
2. **剧本解析** - 解析剧本提取场景、角色、对白
3. **角色提取** - 识别并提取所有角色信息
4. **角色图生成** - 为每个角色生成参考图
5. **分镜拆分** - 将剧本拆分为分镜
6. **帧图生成** - 生成每个分镜的首帧和尾帧
7. **视频生成** - 基于首尾帧插值生成视频片段
8. **视频合成** - 合并所有视频片段为最终视频

## 技术栈

- **框架**: Next.js 15 (App Router)
- **前端**: React 19, TailwindCSS, Radix UI, Zustand
- **数据库**: SQLite + Drizzle ORM
- **AI**: OpenAI GPT-4, DALL-E 3 / ComfyUI
- **语言**: TypeScript

## 项目结构

```
src/
├── app/                          # Next.js App Router
│   ├── api/                      # API 路由
│   │   ├── projects/             # 项目管理 API
│   │   │   └── [id]/
│   │   │       ├── route.ts      # 项目详情
│   │   │       ├── generate/      # 异步生成任务
│   │   │       └── tasks/        # 任务状态查询
│   │   ├── tasks/
│   │   │   ├── execute/         # 任务执行
│   │   │   └── [id]/           # 任务状态
│   │   └── recover/            # 图片恢复
│   ├── project/[id]/            # 项目详情页
│   └── page.tsx                 # 首页/项目列表
├── components/                   # React 组件
│   ├── editor/                  # 编辑器组件
│   └── ui/                      # UI 基础组件
└── lib/
    ├── ai/                      # AI Provider
    │   ├── providers/
    │   │   ├── openai.ts       # OpenAI 文本生成
    │   │   ├── openai-image.ts # DALL-E 图像生成
    │   │   └── comfyui.ts      # ComfyUI 图像/视频生成
    │   └── index.ts            # Provider 统一导出
    ├── db/
    │   ├── schema.ts           # 数据库表结构
    │   └── index.ts            # 数据库连接
    ├── pipeline/               # 生成流水线
    │   ├── script-generate.ts  # 剧本生成
    │   ├── script-parse.ts     # 剧本解析
    │   ├── character-extract.ts # 角色提取
    │   ├── character-image.ts  # 角色图生成
    │   ├── shot-split.ts      # 分镜拆分
    │   ├── frame-generate.ts   # 帧图生成
    │   ├── video-generate.ts   # 视频生成
    │   ├── video-assemble.ts   # 视频合成
    │   └── task-executor.ts    # 任务执行器
    ├── prompts/                # AI 提示词模板
    │   ├── script-generate.ts
    │   ├── character-extract.ts
    │   ├── frame-generate.ts
    │   ├── shot-split.ts
    │   └── video-generate.ts
    └── tasks/                  # 异步任务管理
        └── index.ts           # 任务队列 CRUD
```

## 数据库结构

### projects (项目表)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | text | 主键 (ULID) |
| title | text | 项目标题 |
| idea | text | 初始想法 |
| script | text | 完整剧本 |
| style | text | 风格 (anime/realistic/3d/cartoon) |
| aspectRatio | text | 比例 (16:9/9:16/1:1) |
| status | text | 状态 (draft/processing/completed) |
| finalVideoUrl | text | 最终视频路径 |
| createdAt | timestamp | 创建时间 |
| updatedAt | timestamp | 更新时间 |

### characters (角色表)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | text | 主键 |
| projectId | text | 所属项目 |
| name | text | 角色名 |
| description | text | 角色描述 |
| visualHint | text | 视觉提示词 |
| referenceImage | text | 参考图路径 |
| scope | text | 主/客角色 |

### shots (分镜表)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | text | 主键 |
| projectId | text | 所属项目 |
| sequence | integer | 分镜序号 |
| sceneDescription | text | 场景描述 |
| startFrameDesc | text | 首帧描述 |
| endFrameDesc | text | 尾帧描述 |
| motionScript | text | 运镜脚本 |
| firstFrame | text | 首帧图片路径 |
| lastFrame | text | 尾帧图片路径 |
| videoUrl | text | 视频片段路径 |
| status | text | 状态 |

### dialogues (对白表)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | text | 主键 |
| shotId | text | 所属分镜 |
| characterName | text | 角色名 |
| text | text | 对白内容 |
| emotion | text | 情绪表情 |

### tasks (任务队列表)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | text | 主键 |
| projectId | text | 所属项目 |
| type | text | 任务类型 |
| status | text | 状态 |
| payload | json | 任务参数 |
| result | json | 任务结果 |
| error | text | 错误信息 |

### templates (模板表)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | text | 主键 |
| name | text | 模板名称 |
| description | text | 模板描述 |
| type | text | 模板类型 |
| systemPrompt | text | 系统提示词 |
| projectId | text | 关联项目 |
| isDefault | boolean | 是否默认模板 |
| createdAt | timestamp | 创建时间 |
| updatedAt | timestamp | 更新时间 |

## 数据库迁移

项目使用 Drizzle ORM 管理数据库迁移，迁移文件位于 `drizzle/` 目录。

### 执行迁移

```bash
# 方式1：使用 drizzle-kit push（推荐，自动同步 schema）
pnpm drizzle-kit push

# 方式2：手动执行 SQL 迁移文件
sqlite3 data/comic.db < drizzle/0004_add_templates_fields.sql

# 方式3：生成迁移文件（用于版本控制）
pnpm drizzle-kit generate
```

### 迁移文件说明

| 文件 | 说明 |
|------|------|
| 0000_puzzling_gauntlet.sql | 初始表结构 |
| 0001_add_image_workflow.sql | 添加图片工作流字段 |
| 0002_add_templates.sql | 添加模板表 |
| 0003_add_character_fields.sql | 添加角色视觉描述字段 |
| 0004_add_templates_fields.sql | 添加模板描述和默认标识 |

## API 接口

### 项目管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/projects | 获取项目列表 |
| POST | /api/projects | 创建项目 |
| GET | /api/projects/[id] | 获取项目详情 |
| PUT | /api/projects/[id] | 更新项目 |
| DELETE | /api/projects/[id] | 删除项目 |

### 异步生成

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/projects/[id]/generate | 启动异步生成任务 |
| GET | /api/projects/[id]/tasks | 获取项目任务列表 |

### 任务执行

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/tasks/execute | 执行任务 |
| GET | /api/tasks/[id] | 获取任务状态 |

### 图片恢复

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/recover | 恢复超时任务的图片 |

## 生成流水线

### 分镜连贯性规则

帧图生成遵循严格的连贯性规则：

```
分镜 1: 首帧 A1 (独立生成) → 尾帧 B1
分镜 2: 首帧 B1 (复用分镜1尾帧) → 尾帧 B2
分镜 3: 首帧 B2 (复用分镜2尾帧) → 尾帧 B3
...
分镜 N: 首帧 B(N-1) → 尾帧 BN
```

- 第 N 个分镜的首帧 = 第 N-1 个分镜的尾帧（复用）
- 只有第 1 个分镜需要独立生成首帧
- force 模式下重新生成尾帧时，后续所有分镜的首帧会同步更新

### 任务状态流转

```
pending → running → completed
                  → failed
                  → cancelled
```

### 超时恢复机制

当任务因断电/断网中断时：

1. 系统每 30 分钟自动检查僵尸任务（状态为 running 但超时的任务）
2. 尝试从 ComfyUI 获取已生成的图片
3. 标记超时任务为 failed
4. 清理无效的 promptId
5. 用户可重新生成未完成的部分

## 环境配置

```env
# AI Provider 配置
IMAGE_PROVIDER=comfyui  # 或 openai

# OpenAI 配置
OPENAI_API_KEY=sk-xxx

# ComfyUI 配置
COMFYUI_API_URL=http://localhost:8188

# 文件上传目录
UPLOAD_DIR=./uploads
```

## 常用命令

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build

# 数据库操作
pnpm db:push    # 推送 schema 到数据库
pnpm db:studio  # 打开 Drizzle Studio
pnpm db:generate # 生成迁移文件
```

## 查询数据库

数据库文件位于 `data/comic.db`。

### 方式一：Drizzle Studio（推荐）

```bash
pnpm db:studio
```

打开 Web 界面，可视化查看和编辑数据库数据。

### 方式二：sqlite3 命令行

```bash
# 直接查询
sqlite3 data/comic.db "SELECT * FROM projects;"

# 进入交互式命令行
sqlite3 data/comic.db

# 在交互模式中执行
sqlite> .tables                    # 查看所有表
sqlite> .schema projects           # 查看表结构
sqlite> SELECT * FROM projects;  # 查询数据
sqlite> .exit                      # 退出
```

### 方式三：API 接口

通过 HTTP API 查询数据：

```bash
# 获取所有项目
curl http://localhost:3000/api/projects

# 获取某个项目的详情（包含角色、分镜、对白）
curl http://localhost:3000/api/projects/{projectId}
```

---

## 调试命令

### cURL API 调用示例

```bash
# ==================== 项目管理 ====================

# 获取项目列表
curl -X GET http://localhost:3000/api/projects

# 创建项目
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{"title": "我的漫剧项目", "idea": "一个关于友情的故事", "style": "anime"}'

# 获取项目详情（同时会清理僵尸任务）
curl -X GET http://localhost:3000/api/projects/{projectId}

# 更新项目
curl -X PUT http://localhost:3000/api/projects/{projectId} \
  -H "Content-Type: application/json" \
  -d '{"title": "新标题", "status": "completed"}'

# 删除项目
curl -X DELETE http://localhost:3000/api/projects/{projectId}

# ==================== 异步生成任务 ====================

# 启动剧本生成任务
curl -X POST http://localhost:3000/api/projects/{projectId}/generate \
  -H "Content-Type: application/json" \
  -d '{"action": "script_generate", "idea": "一个关于友情的故事", "style": "anime"}'

# 启动剧本解析任务
curl -X POST http://localhost:3000/api/projects/{projectId}/generate \
  -H "Content-Type: application/json" \
  -d '{"action": "script_parse"}'

# 启动角色提取任务
curl -X POST http://localhost:3000/api/projects/{projectId}/generate \
  -H "Content-Type: application/json" \
  -d '{"action": "character_extract"}'

# 启动角色图生成任务
curl -X POST http://localhost:3000/api/projects/{projectId}/generate \
  -H "Content-Type: application/json" \
  -d '{"action": "character_image"}'
# 或指定某个角色
curl -X POST http://localhost:3000/api/projects/{projectId}/generate \
  -H "Content-Type: application/json" \
  -d '{"action": "character_image", "characterId": "{characterId}"}'

# 启动分镜拆分任务
curl -X POST http://localhost:3000/api/projects/{projectId}/generate \
  -H "Content-Type: application/json" \
  -d '{"action": "shot_split"}'

# 启动帧图生成任务（普通模式，跳过已有图片）
curl -X POST http://localhost:3000/api/projects/{projectId}/generate \
  -H "Content-Type: application/json" \
  -d '{"action": "frame_generate"}'

# 启动帧图生成任务（强制模式，覆盖所有图片）
curl -X POST http://localhost:3000/api/projects/{projectId}/generate \
  -H "Content-Type: application/json" \
  -d '{"action": "frame_generate", "force": true}'

# 启动视频生成任务
curl -X POST http://localhost:3000/api/projects/{projectId}/generate \
  -H "Content-Type: application/json" \
  -d '{"action": "video_generate"}'

# 启动完整流水线
curl -X POST http://localhost:3000/api/projects/{projectId}/generate \
  -H "Content-Type: application/json" \
  -d '{"action": "full_pipeline"}'

# 获取项目任务列表
curl -X GET http://localhost:3000/api/projects/{projectId}/tasks

# ==================== 任务状态查询 ====================

# 获取单个任务状态
curl -X GET http://localhost:3000/api/tasks/{taskId}

# 取消任务
curl -X POST http://localhost:3000/api/tasks/{taskId}/cancel

# ==================== 图片恢复 ====================

# 手动恢复项目图片
curl -X POST http://localhost:3000/api/recover \
  -H "Content-Type: application/json" \
  -d '{"projectId": "{projectId}"}'

# ==================== 轮询任务状态 ====================

# 循环查询任务状态直到完成
TASK_ID="{taskId}"
while true; do
  STATUS=$(curl -s http://localhost:3000/api/tasks/${TASK_ID} | jq -r '.status')
  PROGRESS=$(curl -s http://localhost:3000/api/tasks/${TASK_ID} | jq -r '.progress // 0')
  MESSAGE=$(curl -s http://localhost:3000/api/tasks/${TASK_ID} | jq -r '.currentStep // ""')
  
  echo "[$(date '+%H:%M:%S')] Status: $STATUS, Progress: $PROGRESS% $MESSAGE"
  
  if [[ "$STATUS" == "completed" || "$STATUS" == "failed" || "$STATUS" == "cancelled" ]]; then
    break
  fi
  sleep 2
done
```

### SQLite SQL 查询

数据库文件位于 `data/comic.db`（或 drizzle 迁移目录）。

```sql
-- ==================== 项目查询 ====================

-- 查看所有项目
SELECT * FROM projects ORDER BY created_at DESC;

-- 查看某个项目的详细信息
SELECT * FROM projects WHERE id = '{projectId}';

-- 查看正在处理的项目
SELECT * FROM projects WHERE status = 'processing';

-- ==================== 角色查询 ====================

-- 查看项目的所有角色
SELECT * FROM characters WHERE project_id = '{projectId}';

-- 查看没有参考图的角色（需要生成）
SELECT * FROM characters 
WHERE project_id = '{projectId}' AND reference_image IS NULL;

-- 查看有待恢复图片的角色（有 promptId 但无图片）
SELECT * FROM characters 
WHERE project_id = '{projectId}' AND comfyui_prompt_id IS NOT NULL AND reference_image IS NULL;

-- ==================== 分镜查询 ====================

-- 查看项目的所有分镜
SELECT id, sequence, scene_description, 
       first_frame, last_frame, video_url, status 
FROM shots 
WHERE project_id = '{projectId}' 
ORDER BY sequence;

-- 查看未完成帧图的分镜
SELECT * FROM shots 
WHERE project_id = '{projectId}' 
  AND (first_frame IS NULL OR last_frame IS NULL)
ORDER BY sequence;

-- 查看没有视频的分镜
SELECT * FROM shots 
WHERE project_id = '{projectId}' 
  AND first_frame IS NOT NULL 
  AND last_frame IS NOT NULL 
  AND video_url IS NULL
ORDER BY sequence;

-- 查看分镜的首尾帧关联关系
SELECT 
  s.sequence,
  s.start_frame_desc,
  s.first_frame AS this_first,
  prev.last_frame AS prev_last,
  CASE WHEN prev.last_frame = s.first_frame THEN 'linked' ELSE 'different' END AS link_status,
  s.end_frame_desc,
  s.last_frame
FROM shots s
LEFT JOIN shots prev ON s.project_id = prev.project_id AND prev.sequence = s.sequence - 1
WHERE s.project_id = '{projectId}'
ORDER BY s.sequence;

-- ==================== 任务查询 ====================

-- 查看项目的所有任务
SELECT id, type, status, payload, error, created_at 
FROM tasks 
WHERE project_id = '{projectId}' 
ORDER BY created_at DESC;

-- 查看正在运行的任务
SELECT * FROM tasks WHERE status = 'running';

-- 查看失败的任务
SELECT * FROM tasks WHERE status = 'failed';

-- 查看僵尸任务（运行超过30分钟）
SELECT * FROM tasks 
WHERE status = 'running' 
  AND created_at < datetime('now', '-30 minutes');

-- 查看某个类型的最新任务
SELECT * FROM tasks 
WHERE project_id = '{projectId}' AND type = 'frame_generate'
ORDER BY created_at DESC LIMIT 1;

-- ==================== 统计数据 ====================

-- 项目统计：每个项目的分镜数、已完成分镜数、视频数
SELECT 
  p.title,
  p.status,
  COUNT(DISTINCT s.id) as total_shots,
  COUNT(DISTINCT CASE WHEN s.first_frame IS NOT NULL THEN s.id END) as shots_with_first,
  COUNT(DISTINCT CASE WHEN s.last_frame IS NOT NULL THEN s.id END) as shots_with_last,
  COUNT(DISTINCT CASE WHEN s.video_url IS NOT NULL THEN s.id END) as shots_with_video
FROM projects p
LEFT JOIN shots s ON p.id = s.project_id
GROUP BY p.id
ORDER BY p.created_at DESC;

-- 清理僵尸任务（将30分钟以上的 running 任务标记为 failed）
UPDATE tasks 
SET status = 'failed', 
    error = 'Task timed out (auto-cleanup)'
WHERE status = 'running' 
  AND created_at < datetime('now', '-30 minutes');

-- 清理无效的 promptId
UPDATE characters SET comfyui_prompt_id = NULL WHERE reference_image IS NOT NULL;
UPDATE shots SET first_frame_prompt_id = NULL WHERE first_frame IS NOT NULL;
UPDATE shots SET last_frame_prompt_id = NULL WHERE last_frame IS NOT NULL;

-- ==================== 对白查询 ====================

-- 查看某分镜的所有对白
SELECT d.*, s.sequence as shot_sequence
FROM dialogues d
JOIN shots s ON d.shot_id = s.id
WHERE s.project_id = '{projectId}'
ORDER BY s.sequence, d.sequence;

-- 统计每个角色的对白数量
SELECT character_name, COUNT(*) as dialogue_count
FROM dialogues d
JOIN shots s ON d.shot_id = s.id
WHERE s.project_id = '{projectId}'
GROUP BY character_name
ORDER BY dialogue_count DESC;
```

## 分镜生成提示词设计

### 首帧提示词要素

```
- 画面类型: OPENING FRAME / CLOSING FRAME
- 分镜描述: 场景、动作、情绪
- 角色信息: 角色列表及视觉特征
- 风格要求: anime/realistic/3d/cartoon
- 连贯性: 与上一分镜尾帧的衔接要求
```

### 尾帧特殊要求

```
- 必须是稳定姿态（适合作为下一分镜首帧）
- 保持服装、道具一致性
- 自然的表情/动作（适合暂停点）
```
