import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// 项目表
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  idea: text("idea").default(""),
  // 中文剧本文本（分集前的原始文本）
  scriptText: text("script_text").default(""),
  // 解析后的JSON剧本
  script: text("script").default(""),
  // 总集数
  totalEpisodes: integer("total_episodes").default(1),
  style: text("style").default("anime"), // anime, realistic, 3d, cartoon
  aspectRatio: text("aspect_ratio").default("16:9"), // 16:9, 9:16, 1:1
  status: text("status", {
    enum: ["draft", "processing", "completed"],
  }).notNull().default("draft"),
  finalVideoUrl: text("final_video_url"),
  // 项目级图片生成工作流配置（存储 JSON）
  imageWorkflow: text("image_workflow"),
  // 项目级视频生成工作流配置（存储 JSON）
  videoWorkflow: text("video_workflow"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// 角色表
export const characters = sqliteTable("characters", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // 剧情描述：角色的背景故事、性格特点、在剧情中的作用
  description: text("description").default(""),
  // 视觉描述：专业的外貌描述，用于生成角色图像
  visualDescription: text("visual_description").default(""),
  // 简短视觉提示词（用于快速参考）
  visualHint: text("visual_hint").default(""),
  referenceImage: text("reference_image"),
  comfyuiPromptId: text("comfyui_prompt_id"), // 用于恢复超时任务
  scope: text("scope", { enum: ["main", "guest"] }).notNull().default("main"),
  // 所属集数（可选，默认第1集）
  episode: integer("episode").default(1),
});

// 分镜表
export const shots = sqliteTable("shots", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  sceneDescription: text("scene_description").default(""),
  startFrameDesc: text("start_frame_desc"),
  endFrameDesc: text("end_frame_desc"),
  motionScript: text("motion_script"),
  videoScript: text("video_script"),
  cameraDirection: text("camera_direction").default("static"),
  duration: integer("duration").notNull().default(10),
  firstFrame: text("first_frame"),
  lastFrame: text("last_frame"),
  firstFramePromptId: text("first_frame_prompt_id"), // 用于恢复超时任务
  lastFramePromptId: text("last_frame_prompt_id"),    // 用于恢复超时任务
  videoUrl: text("video_url"),
  status: text("status", {
    enum: ["pending", "generating", "partial", "completed", "failed"],
  }).notNull().default("pending"),
});

// 对白表
export const dialogues = sqliteTable("dialogues", {
  id: text("id").primaryKey(),
  shotId: text("shot_id")
    .notNull()
    .references(() => shots.id, { onDelete: "cascade" }),
  characterName: text("character_name").notNull(),
  text: text("text").notNull(),
  emotion: text("emotion").default(""),
  sequence: integer("sequence").notNull().default(0),
});

// 任务队列表
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  type: text("type", {
    enum: [
      "script_parse",
      "character_extract",
      "character_image",
      "shot_split",
      "frame_generate",
      "video_generate",
      "video_assemble",
    ],
  }).notNull(),
  status: text("status", {
    enum: ["pending", "running", "completed", "failed", "cancelled"],
  }).notNull().default("pending"),
  payload: text("payload", { mode: "json" }),
  result: text("result", { mode: "json" }),
  error: text("error"),
  comfyuiPromptId: text("comfyui_prompt_id"), // 用于恢复超时任务
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// 模板表
export const templates = sqliteTable("templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").default(""),
  // 模板类型: character_description, image_workflow, video_workflow
  type: text("type", {
    enum: ["character_description", "image_workflow", "video_workflow"],
  }).notNull(),
  // 模板内容（Prompt 或 Workflow JSON）
  systemPrompt: text("system_prompt").notNull(),
  // 关联项目（可选，null 表示全局模板）
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  // 是否为默认模板
  isDefault: integer("is_default", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// 类型导出
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Character = typeof characters.$inferSelect;
export type NewCharacter = typeof characters.$inferInsert;
export type Shot = typeof shots.$inferSelect;
export type NewShot = typeof shots.$inferInsert;
export type Dialogue = typeof dialogues.$inferSelect;
export type NewDialogue = typeof dialogues.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;
