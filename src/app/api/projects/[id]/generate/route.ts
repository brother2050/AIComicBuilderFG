/**
 * 异步生成 API
 * 将长时间任务转为后台异步执行，支持进度查询
 */
import { NextResponse } from "next/server";
import { db, projects } from "@/lib/db";
import { eq } from "drizzle-orm";
import { createTask, getLatestTask, cleanupStaleTasks, type TaskType } from "@/lib/tasks";

type GenerateAction =
  | "script_generate"
  | "script_parse"
  | "character_extract"
  | "character_image"
  | "shot_split"
  | "frame_generate"
  | "video_generate"
  | "video_assemble"
  | "full_pipeline";

// 任务类型映射
const ACTION_TO_TASK_TYPE: Record<GenerateAction, TaskType> = {
  "script_generate": "script_parse",
  "script_parse": "script_parse",
  "character_extract": "character_extract",
  "character_image": "character_image",
  "shot_split": "shot_split",
  "frame_generate": "frame_generate",
  "video_generate": "video_generate",
  "video_assemble": "video_assemble",
  "full_pipeline": "script_parse",
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  try {
    const body = await request.json();
    const { action, shotId, idea, style, force } = body as {
      action: GenerateAction;
      shotId?: string;
      idea?: string;
      style?: string;
      force?: boolean;
    };

    if (!action) {
      return NextResponse.json({ error: "Action is required" }, { status: 400 });
    }

    // 验证项目存在
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // script_generate 需要 idea
    if (action === "script_generate" && !idea) {
      return NextResponse.json({ error: "Idea is required for script generation" }, { status: 400 });
    }

    // 创建新任务前，先清理该项目的僵尸任务（只有超时30分钟的running任务）
    const cleanupResult = await cleanupStaleTasks(projectId);
    if (cleanupResult.cleaned > 0 || cleanupResult.recoveredImages > 0) {
      console.log(`[API] Cleanup before task: ${cleanupResult.cleaned} stale tasks, ${cleanupResult.recoveredImages} images recovered`);
    }

    // 检查是否有正在运行的任务（除非是强制重新执行）
    const latestTask = await getLatestTask(projectId, ACTION_TO_TASK_TYPE[action]);
    if (latestTask && latestTask.status === "running" && !force) {
      return NextResponse.json({
        error: "A task is already running for this type",
        taskId: latestTask.taskId,
        status: latestTask.status,
      }, { status: 409 });
    }

    // 创建任务
    const taskId = await createTask(projectId, ACTION_TO_TASK_TYPE[action], {
      shotId,
      action,
      idea,
      style,
      force,
    });

    console.log(`[API] Created async task: ${taskId} for action: ${action}, force: ${force}`);

    // 返回任务ID，前端可通过轮询获取进度
    return NextResponse.json({
      success: true,
      taskId,
      message: `Task started: ${action}${force ? " (forced)" : ""}`,
    });

  } catch (error) {
    console.error(`[API] Failed to create task:`, error);
    return NextResponse.json(
      {
        error: "Failed to create task",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
