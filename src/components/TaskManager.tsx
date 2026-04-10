"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Loader2,
  Play,
  StopCircle,
  Trash2,
  List,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
} from "lucide-react";

interface TaskProgress {
  taskId: string;
  type: string;
  status: string;
  progress: number;
  currentStep?: string;
  totalSteps?: number;
  currentStepIndex?: number;
  error?: string;
  createdAt: Date;
}

const TASK_TYPE_NAMES: Record<string, string> = {
  script_parse: "剧本解析",
  character_extract: "角色提取",
  character_image: "角色图像",
  shot_split: "分镜拆分",
  frame_generate: "帧生成",
  video_generate: "视频生成",
  video_assemble: "视频合成",
};

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  pending: { color: "bg-gray-500", icon: <Clock className="w-3 h-3" />, label: "等待中" },
  running: { color: "bg-blue-500", icon: <Loader2 className="w-3 h-3 animate-spin" />, label: "运行中" },
  completed: { color: "bg-green-500", icon: <CheckCircle className="w-3 h-3" />, label: "已完成" },
  failed: { color: "bg-red-500", icon: <XCircle className="w-3 h-3" />, label: "失败" },
  cancelled: { color: "bg-yellow-500", icon: <AlertCircle className="w-3 h-3" />, label: "已取消" },
};

interface TaskManagerProps {
  projectId: string;
  onTaskStart?: (taskId: string) => void;
}

export function TaskManager({ projectId, onTaskStart }: TaskManagerProps) {
  const [tasks, setTasks] = useState<TaskProgress[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // 加载任务列表
  const loadTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`);
      const data = await res.json();
      if (data.tasks) {
        setTasks(data.tasks);
      }
    } catch (error) {
      console.error("Failed to load tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  // 打开弹窗时加载任务
  useEffect(() => {
    if (open) {
      loadTasks();
    }
  }, [open, projectId]);

  // 定期刷新运行中的任务
  useEffect(() => {
    if (!open) return;

    const hasRunning = tasks.some((t) => t.status === "running" || t.status === "pending");
    if (!hasRunning) return;

    const interval = setInterval(() => {
      loadTasks();
    }, 3000);

    return () => clearInterval(interval);
  }, [open, tasks]);

  // 取消任务
  const handleCancel = async (taskId: string) => {
    setActionLoading(taskId);
    try {
      await fetch(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: "DELETE",
      });
      await loadTasks();
    } catch (error) {
      console.error("Failed to cancel task:", error);
    } finally {
      setActionLoading(null);
    }
  };

  // 删除任务
  const handleDelete = async (taskId: string) => {
    setActionLoading(taskId);
    try {
      await fetch(`/api/projects/${projectId}/tasks/${taskId}?action=delete`, {
        method: "DELETE",
      });
      await loadTasks();
    } catch (error) {
      console.error("Failed to delete task:", error);
    } finally {
      setActionLoading(null);
    }
  };

  // 重试任务（重新创建）
  const handleRetry = async (task: TaskProgress) => {
    setActionLoading(task.taskId);
    try {
      // 从 payload 中提取原始参数
      const res = await fetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: task.type,
          force: true,
        }),
      });
      const data = await res.json();
      if (data.taskId) {
        onTaskStart?.(data.taskId);
        await loadTasks();
      }
    } catch (error) {
      console.error("Failed to retry task:", error);
    } finally {
      setActionLoading(null);
    }
  };

  // 获取运行中的任务
  const runningTasks = tasks.filter((t) => t.status === "running" || t.status === "pending");
  const recentTasks = tasks.slice(0, 10); // 最近10个任务

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <List className="w-4 h-4 mr-1" />
          任务
          {runningTasks.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
              {runningTasks.length}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <List className="w-5 h-5" />
            任务管理
            {loading && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-3">
          {recentTasks.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              暂无任务记录
            </div>
          ) : (
            recentTasks.map((task) => {
              const statusConfig = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
              const isLoading = actionLoading === task.taskId;

              return (
                <Card key={task.taskId} className="relative">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      {/* 状态图标 */}
                      <div className={`p-2 rounded-full ${statusConfig.color} text-white`}>
                        {statusConfig.icon}
                      </div>

                      {/* 任务信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {TASK_TYPE_NAMES[task.type] || task.type}
                          </span>
                          <Badge className={`${statusConfig.color} text-white text-xs`}>
                            {statusConfig.label}
                          </Badge>
                        </div>

                        {/* 进度条 */}
                        {(task.status === "running" || task.status === "pending") && (
                          <div className="mt-2">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 transition-all duration-300"
                                  style={{ width: `${task.progress}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-500">{task.progress}%</span>
                            </div>
                            {task.currentStep && (
                              <p className="text-xs text-gray-500 truncate">
                                {task.currentStep}
                              </p>
                            )}
                          </div>
                        )}

                        {/* 错误信息 */}
                        {task.status === "failed" && task.error && (
                          <p className="text-xs text-red-500 mt-1">
                            {task.error}
                          </p>
                        )}

                        {/* 时间 */}
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(task.createdAt).toLocaleString()}
                        </p>
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex gap-1">
                        {/* 取消按钮 - 运行中的任务 */}
                        {(task.status === "running" || task.status === "pending") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancel(task.taskId)}
                            disabled={isLoading}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            {isLoading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <StopCircle className="w-4 h-4" />
                            )}
                          </Button>
                        )}

                        {/* 重试按钮 - 失败或取消的任务 */}
                        {(task.status === "failed" || task.status === "cancelled") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRetry(task)}
                            disabled={isLoading}
                            className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                          >
                            {isLoading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4" />
                            )}
                          </Button>
                        )}

                        {/* 删除按钮 - 非运行中的任务 */}
                        {task.status !== "running" && task.status !== "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(task.taskId)}
                            disabled={isLoading}
                            className="text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                          >
                            {isLoading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* 底部刷新按钮 */}
        <div className="pt-4 border-t flex justify-center">
          <Button variant="outline" size="sm" onClick={loadTasks} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            刷新
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
