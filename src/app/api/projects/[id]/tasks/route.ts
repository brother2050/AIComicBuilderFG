/**
 * 任务状态 API
 * 支持查询任务进度、取消任务
 */
import { NextResponse } from "next/server";
import { getProjectTasks, getTaskStatus, getLatestTask, cancelTask, type TaskType } from "@/lib/tasks";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("taskId");
  const type = searchParams.get("type") as TaskType | null;

  try {
    if (taskId) {
      // 获取单个任务状态
      const task = await getTaskStatus(taskId);
      if (!task) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }
      return NextResponse.json({ task });
    }

    if (type) {
      // 获取最新指定类型的任务
      const task = await getLatestTask(projectId, type);
      return NextResponse.json({ task });
    }

    // 获取项目所有任务
    const tasks = await getProjectTasks(projectId);
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("[API] Failed to get tasks:", error);
    return NextResponse.json(
      { error: "Failed to get tasks" },
      { status: 500 }
    );
  }
}
