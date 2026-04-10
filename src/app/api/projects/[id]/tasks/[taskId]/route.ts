/**
 * 单个任务管理 API
 * 支持获取任务、取消任务、删除任务
 */
import { NextResponse } from "next/server";
import { cancelTask, getTaskStatus } from "@/lib/tasks";
import { db, tasks } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { taskId } = await params;
  
  try {
    console.log(`[API Task] GET request: taskId=${taskId}`);
    const task = await getTaskStatus(taskId);
    if (!task) {
      console.warn(`[API Task] Task not found: ${taskId}`);
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    console.log(`[API Task] Task retrieved: taskId=${task.taskId}, status=${task.status}, type=${task.type}`);
    return NextResponse.json({ task });
  } catch (error) {
    console.error("[API Task] Failed to get task:", {
      taskId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "Failed to get task" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { taskId } = await params;
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "cancel"; // cancel | delete
  
  console.log(`[API Task] DELETE request: taskId=${taskId}, action=${action}`);
  
  try {
    if (action === "delete") {
      // 真正删除任务记录
      await db.delete(tasks).where(eq(tasks.id, taskId));
      console.log(`[API Task] Task deleted: ${taskId}`);
      return NextResponse.json({ success: true, message: "Task deleted" });
    }
    
    // 默认行为：取消任务
    const success = await cancelTask(taskId);
    if (!success) {
      console.warn(`[API Task] Cannot cancel task: ${taskId} - not found or already completed`);
      return NextResponse.json(
        { error: "Cannot cancel task - task not found or already completed" },
        { status: 400 }
      );
    }
    console.log(`[API Task] Task cancelled: ${taskId}`);
    return NextResponse.json({ success: true, message: "Task cancelled" });
  } catch (error) {
    console.error("[API Task] Failed to process task:", {
      taskId,
      action,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "Failed to process task" },
      { status: 500 }
    );
  }
}
