/**
 * 单个任务管理 API
 * 支持取消任务
 */
import { NextResponse } from "next/server";
import { cancelTask, getTaskStatus } from "@/lib/tasks";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { taskId } = await params;
  
  try {
    const task = await getTaskStatus(taskId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    return NextResponse.json({ task });
  } catch (error) {
    console.error("[API] Failed to get task:", error);
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
  
  try {
    const success = await cancelTask(taskId);
    if (!success) {
      return NextResponse.json(
        { error: "Cannot cancel task - task not found or already completed" },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: true, message: "Task cancelled" });
  } catch (error) {
    console.error("[API] Failed to cancel task:", error);
    return NextResponse.json(
      { error: "Failed to cancel task" },
      { status: 500 }
    );
  }
}
