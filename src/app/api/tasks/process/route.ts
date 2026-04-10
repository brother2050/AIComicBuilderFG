/**
 * 任务处理 API
 * 自动处理待执行的任务（通过轮询）
 */
import { NextResponse } from "next/server";
import { db, tasks } from "@/lib/db";
import { eq } from "drizzle-orm";
import { executeTask } from "@/lib/pipeline/task-executor";

export async function POST(request: Request) {
  try {
    // 获取所有 pending 状态的任务
    const pendingTasks = await db.query.tasks.findMany({
      where: eq(tasks.status, "pending"),
      orderBy: (t, { asc }) => [asc(t.createdAt)],
      limit: 1, // 每次只处理一个任务
    });

    if (pendingTasks.length === 0) {
      console.log(`[Task Processor] No pending tasks found`);
      return NextResponse.json({ 
        processed: 0,
        message: "No pending tasks" 
      });
    }

    const task = pendingTasks[0];
    const payload = (task.payload || {}) as Record<string, unknown>;
    const action = payload.action as string;

    console.log(`[Task Processor] Found pending task:`, {
      taskId: task.id,
      type: task.type,
      projectId: task.projectId,
      action,
      payload: {
        shotId: payload.shotId || null,
        idea: payload.idea ? (payload.idea as string).slice(0, 100) + "..." : null,
        style: payload.style || null,
        force: payload.force || false,
      },
    });

    if (!action || !task.projectId) {
      console.warn(`[Task Processor] Task missing required data:`, {
        taskId: task.id,
        action: action || 'MISSING',
        projectId: task.projectId || 'MISSING',
      });
      // 更新任务状态为失败
      await db.update(tasks)
        .set({ 
          status: "failed",
          error: "Missing action or projectId",
        })
        .where(eq(tasks.id, task.id));

      return NextResponse.json({ 
        processed: 0,
        message: "Task missing required data, marked as failed" 
      });
    }

    // 执行任务
    console.log(`[Task Processor] Starting task execution: taskId=${task.id}, action=${action}`);
    const startTime = Date.now();
    
    try {
      await executeTask(
        task.id, 
        task.projectId, 
        action as Parameters<typeof executeTask>[2],
        {
          shotId: payload.shotId as string | undefined,
          idea: payload.idea as string | undefined,
          style: payload.style as string | undefined,
        }
      );
      console.log(`[Task Processor] Task completed successfully: taskId=${task.id}, duration=${Date.now() - startTime}ms`);
    } catch (error) {
      console.error(`[Task Processor] Task failed:`, {
        taskId: task.id,
        action,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }

    return NextResponse.json({ 
      processed: 1,
      taskId: task.id,
      message: `Task ${action} executed` 
    });
  } catch (error) {
    console.error("[API] Task processing error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: "Failed to process tasks" },
      { status: 500 }
    );
  }
}

// GET 请求用于检查是否有待处理任务（供前端轮询使用）
export async function GET() {
  try {
    const pendingTasks = await db.query.tasks.findMany({
      where: eq(tasks.status, "pending"),
      orderBy: (t, { asc }) => [asc(t.createdAt)],
      limit: 10,
    });

    const runningTasks = await db.query.tasks.findMany({
      where: eq(tasks.status, "running"),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      limit: 10,
    });

    return NextResponse.json({
      pendingCount: pendingTasks.length,
      runningCount: runningTasks.length,
      pendingTasks: pendingTasks.map(t => ({
        id: t.id,
        type: t.type,
        projectId: t.projectId,
        createdAt: t.createdAt,
      })),
      runningTasks: runningTasks.map(t => ({
        id: t.id,
        type: t.type,
        projectId: t.projectId,
        payload: t.payload,
      })),
    });
  } catch (error) {
    console.error("[API] Task status error:", error);
    return NextResponse.json(
      { error: "Failed to get task status" },
      { status: 500 }
    );
  }
}
