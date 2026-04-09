/**
 * 异步任务管理
 * 支持长时间任务的分阶段执行、进度查询、取消、重试
 */
import { db, tasks, characters, shots } from "@/lib/db";
import { eq, and, lt } from "drizzle-orm";
import { ulid } from "ulid";
import { fetchComfyUIImageByPromptId } from "@/lib/ai";

export type TaskType = 
  | "script_parse"
  | "character_extract" 
  | "character_image"
  | "shot_split"
  | "frame_generate"
  | "video_generate"
  | "video_assemble";

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface TaskProgress {
  taskId: string;
  type: TaskType;
  status: TaskStatus;
  progress: number;        // 0-100
  currentStep?: string;
  totalSteps?: number;
  currentStepIndex?: number;
  result?: Record<string, unknown>;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  message: string;
  result?: Record<string, unknown>;
}

/**
 * 创建异步任务
 */
export async function createTask(
  projectId: string,
  type: TaskType,
  payload?: Record<string, unknown>
): Promise<string> {
  const taskId = ulid();
  
  await db.insert(tasks).values({
    id: taskId,
    projectId,
    type,
    status: "pending",
    payload: payload || {},
    createdAt: new Date(),
  });

  return taskId;
}

/**
 * 更新任务状态
 */
export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  progress?: number,
  currentStep?: string,
  totalSteps?: number,
  currentStepIndex?: number,
  result?: Record<string, unknown>,
  error?: string
): Promise<void> {
  await db.update(tasks)
    .set({
      status,
      result: result || undefined,
      error: error || undefined,
      // 存储进度信息到 payload 中
      payload: {
        progress: progress || 0,
        currentStep,
        totalSteps,
        currentStepIndex,
      },
    })
    .where(eq(tasks.id, taskId));
}

/**
 * 获取任务状态
 */
export async function getTaskStatus(taskId: string): Promise<TaskProgress | null> {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });

  if (!task) return null;

  const payload = (task.payload || {}) as Record<string, unknown>;

  return {
    taskId: task.id,
    type: task.type as TaskType,
    status: task.status as TaskStatus,
    progress: (payload.progress as number) || 0,
    currentStep: payload.currentStep as string | undefined,
    totalSteps: payload.totalSteps as number | undefined,
    currentStepIndex: payload.currentStepIndex as number | undefined,
    result: (task.result || undefined) as Record<string, unknown> | undefined,
    error: task.error || undefined,
    createdAt: task.createdAt,
    updatedAt: task.createdAt,
  };
}

/**
 * 获取项目的最新任务
 */
export async function getLatestTask(projectId: string, type?: TaskType): Promise<TaskProgress | null> {
  const conditions = [eq(tasks.projectId, projectId)];
  if (type) {
    conditions.push(eq(tasks.type, type));
  }

  const allTasks = await db.query.tasks.findMany({
    where: and(...conditions),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    limit: 1,
  });

  if (allTasks.length === 0) return null;
  
  const task = allTasks[0];
  const payload = (task.payload || {}) as Record<string, unknown>;

  return {
    taskId: task.id,
    type: task.type as TaskType,
    status: task.status as TaskStatus,
    progress: (payload.progress as number) || 0,
    currentStep: payload.currentStep as string | undefined,
    totalSteps: payload.totalSteps as number | undefined,
    currentStepIndex: payload.currentStepIndex as number | undefined,
    result: (task.result || undefined) as Record<string, unknown> | undefined,
    error: task.error || undefined,
    createdAt: task.createdAt,
    updatedAt: task.createdAt,
  };
}

/**
 * 取消任务
 */
export async function cancelTask(taskId: string): Promise<boolean> {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });

  if (!task || task.status === "completed") {
    return false;
  }

  await db.update(tasks)
    .set({ status: "cancelled" })
    .where(eq(tasks.id, taskId));

  return true;
}

/**
 * 检查任务是否被取消
 */
export async function isTaskCancelled(taskId: string): Promise<boolean> {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });

  return task?.status === "cancelled";
}

/**
 * 获取项目的所有任务
 */
export async function getProjectTasks(projectId: string): Promise<TaskProgress[]> {
  const allTasks = await db.query.tasks.findMany({
    where: eq(tasks.projectId, projectId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  return allTasks.map(task => {
    const payload = (task.payload || {}) as Record<string, unknown>;
    return {
      taskId: task.id,
      type: task.type as TaskType,
      status: task.status as TaskStatus,
      progress: (payload.progress as number) || 0,
      currentStep: payload.currentStep as string | undefined,
      totalSteps: payload.totalSteps as number | undefined,
      currentStepIndex: payload.currentStepIndex as number | undefined,
      result: (task.result || undefined) as Record<string, unknown> | undefined,
      error: task.error || undefined,
      createdAt: task.createdAt,
      updatedAt: task.createdAt,
    };
  });
}

/**
 * 清理僵尸任务并恢复可能的图片
 * 将超时的 running 任务标记为 failed，并尝试恢复其中可能已生成的图片
 */
export async function cleanupStaleTasks(projectId: string): Promise<{
  cleaned: number;
  recoveredImages: number;
}> {
  const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 分钟
  const staleTime = new Date(Date.now() - STALE_THRESHOLD_MS);

  console.log(`[TaskCleanup] Checking for stale tasks in project: ${projectId}, threshold: ${STALE_THRESHOLD_MS}ms`);

  let cleanedCount = 0;
  let recoveredCount = 0;

  try {
    // 1. 找到超时的 running 任务，直接标记为 failed（不等待恢复）
    const staleTasks = await db.query.tasks.findMany({
      where: and(
        eq(tasks.projectId, projectId),
        eq(tasks.status, "running"),
        lt(tasks.createdAt, staleTime)
      ),
    });

    console.log(`[TaskCleanup] Found ${staleTasks.length} stale tasks, marking as failed`);

    for (const task of staleTasks) {
      await db.update(tasks)
        .set({ 
          status: "failed",
          error: "Task timed out due to interruption (power loss or crash)",
        })
        .where(eq(tasks.id, task.id));
      cleanedCount++;
      console.log(`[TaskCleanup] Marked task ${task.id} as failed`);
    }

    // 2. 快速检查：恢复角色图中可能有的待恢复图片（只查一次，不等待）
    const chars = await db.query.characters.findMany({
      where: eq(characters.projectId, projectId),
    });

    for (const char of chars) {
      if (char.comfyuiPromptId && !char.referenceImage) {
        try {
          const savedPath = await fetchComfyUIImageByPromptId(char.comfyuiPromptId);
          if (savedPath) {
            await db.update(characters)
              .set({ referenceImage: savedPath, comfyuiPromptId: null })
              .where(eq(characters.id, char.id));
            recoveredCount++;
            console.log(`[TaskCleanup] Recovered character image: ${char.name}`);
          }
        } catch (err) {
          // 恢复失败，直接清理 promptId 即可
          await db.update(characters)
            .set({ comfyuiPromptId: null })
            .where(eq(characters.id, char.id));
          console.warn(`[TaskCleanup] Failed to recover character image ${char.name}:`, err);
        }
      }
    }

    // 3. 快速检查：恢复分镜帧图中可能有的待恢复图片（只查一次，不等待）
    const projectShots = await db.query.shots.findMany({
      where: eq(shots.projectId, projectId),
    });

    for (const shot of projectShots) {
      // 恢复首帧
      if (shot.firstFramePromptId && !shot.firstFrame) {
        try {
          const savedPath = await fetchComfyUIImageByPromptId(shot.firstFramePromptId);
          if (savedPath) {
            await db.update(shots)
              .set({ firstFrame: savedPath, firstFramePromptId: null })
              .where(eq(shots.id, shot.id));
            recoveredCount++;
            console.log(`[TaskCleanup] Recovered first frame for shot ${shot.sequence}`);
          } else {
            // 没有图片，清理 promptId
            await db.update(shots)
              .set({ firstFramePromptId: null })
              .where(eq(shots.id, shot.id));
          }
        } catch (err) {
          await db.update(shots)
            .set({ firstFramePromptId: null })
            .where(eq(shots.id, shot.id));
          console.warn(`[TaskCleanup] Failed to recover first frame for shot ${shot.sequence}:`, err);
        }
      }

      // 恢复尾帧
      if (shot.lastFramePromptId && !shot.lastFrame) {
        try {
          const savedPath = await fetchComfyUIImageByPromptId(shot.lastFramePromptId);
          if (savedPath) {
            await db.update(shots)
              .set({ lastFrame: savedPath, lastFramePromptId: null })
              .where(eq(shots.id, shot.id));
            recoveredCount++;
            console.log(`[TaskCleanup] Recovered last frame for shot ${shot.sequence}`);
          } else {
            // 没有图片，清理 promptId
            await db.update(shots)
              .set({ lastFramePromptId: null })
              .where(eq(shots.id, shot.id));
          }
        } catch (err) {
          await db.update(shots)
            .set({ lastFramePromptId: null })
            .where(eq(shots.id, shot.id));
          console.warn(`[TaskCleanup] Failed to recover last frame for shot ${shot.sequence}:`, err);
        }
      }
    }

    if (cleanedCount > 0 || recoveredCount > 0) {
      console.log(`[TaskCleanup] Summary: cleaned ${cleanedCount} stale tasks, recovered ${recoveredCount} images`);
    }
  } catch (error) {
    console.error("[TaskCleanup] Error during cleanup:", error);
  }

  return { cleaned: cleanedCount, recoveredImages: recoveredCount };
}
