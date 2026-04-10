/**
 * 任务执行 API
 * 后台处理长时间任务
 */
import { NextResponse } from "next/server";
import { db, tasks } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { executeTask } from "@/lib/pipeline/task-executor";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { taskId, projectId, action, shotId, idea, style, force, episode } = body;

    if (!taskId || !projectId || !action) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    // 验证任务存在且为 pending 状态
    const task = await db.query.tasks.findFirst({
      where: and(
        eq(tasks.id, taskId),
        eq(tasks.status, "pending")
      ),
    });

    if (!task) {
      return NextResponse.json(
        { error: "Task not found or already processed" },
        { status: 404 }
      );
    }

    // 在后台异步执行任务
    // 注意：在生产环境中应该使用队列系统如 BullMQ
    executeTask(taskId, projectId, action, { shotId, idea, style, force, episode }).catch(err => {
      console.error(`[Task] Background execution failed:`, err);
    });

    return NextResponse.json({
      success: true,
      taskId,
      message: "Task execution started",
    });
  } catch (error) {
    console.error("[API] Task execution error:", error);
    return NextResponse.json(
      { error: "Failed to start task execution" },
      { status: 500 }
    );
  }
}
