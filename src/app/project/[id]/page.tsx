"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Play,
  Loader2,
  Sparkles,
  Image,
  Film,
  Users,
  CheckCircle,
  Trash2,
  Plus,
  Edit2,
  Save,
  X,
  StopCircle,
} from "lucide-react";
import { getFileUrl } from "@/lib/utils";

interface Character {
  id: string;
  name: string;
  description: string;
  visualHint: string;
  referenceImage: string | null;
  scope: string;
}

interface Dialogue {
  id: string;
  characterName: string;
  text: string;
  emotion: string;
  sequence: number;
}

interface Shot {
  id: string;
  sequence: number;
  sceneDescription: string;
  startFrameDesc: string;
  endFrameDesc: string;
  motionScript: string;
  videoScript: string;
  cameraDirection: string;
  duration: number;
  firstFrame: string | null;
  lastFrame: string | null;
  videoUrl: string | null;
  status: string;
  dialogues: Dialogue[];
}

interface Project {
  id: string;
  title: string;
  script: string;
  style: string;
  aspectRatio: string;
  status: string;
  finalVideoUrl: string | null;
}

interface TaskProgress {
  taskId: string;
  type: string;
  status: string;
  progress: number;
  currentStep?: string;
  totalSteps?: number;
  currentStepIndex?: number;
  error?: string;
}

type PipelineStep = {
  key: string;
  name: string;
  icon: React.ElementType;
  action: string;
  description: string;
  editable?: boolean;
};

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [taskProgress, setTaskProgress] = useState<TaskProgress | null>(null);
  const [pollingActive, setPollingActive] = useState(false);

  // 编辑状态
  const [editingShot, setEditingShot] = useState<Shot | null>(null);
  const [editingChar, setEditingChar] = useState<Character | null>(null);
  const [editingScript, setEditingScript] = useState(false);

  // AI 生成剧本对话框
  const [showIdeaDialog, setShowIdeaDialog] = useState(false);
  const [ideaText, setIdeaText] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("anime");

  useEffect(() => {
    fetchProject();
  }, [projectId]);

  // 轮询任务进度
  useEffect(() => {
    if (!pollingActive) return;

    const pollInterval = setInterval(async () => {
      if (taskProgress?.taskId) {
        try {
          const res = await fetch(`/api/projects/${projectId}/tasks?taskId=${taskProgress.taskId}`, {
            cache: "no-store"
          });
          const data = await res.json();
          if (data.task) {
            const newStatus = data.task.status;
            setTaskProgress(data.task);
            
            // 如果是图片生成任务，持续刷新数据以显示生成进度
            const isImageGeneration = ["frame_generate", "character_image"].includes(data.task.type);
            
            // 任务完成时停止轮询并刷新
            if (newStatus === "completed" || newStatus === "failed") {
              setPollingActive(false);
              setGenerating(null);
              if (newStatus === "completed") {
                // 直接调用 fetch 刷新数据
                await fetch(`/api/projects/${projectId}`, { cache: "no-store" })
                  .then(r => r.json())
                  .then(d => {
                    setProject(d.project);
                    setCharacters(d.characters || []);
                    setShots(d.shots || []);
                  });
              }
            } else if (isImageGeneration) {
              // 图片生成任务进行中，每隔一段时间刷新一次数据
              // 直接调用 fetch 刷新数据
              await fetch(`/api/projects/${projectId}`, { cache: "no-store" })
                .then(r => r.json())
                .then(d => {
                  setProject(d.project);
                  setCharacters(d.characters || []);
                  setShots(d.shots || []);
                });
            }
          }
        } catch (error) {
          console.error("Failed to poll task status:", error);
        }
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [pollingActive, taskProgress?.taskId, projectId]);

  const fetchProject = async () => {
    try {
      // 禁用缓存，确保获取最新数据
      const res = await fetch(`/api/projects/${projectId}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
        },
      });
      const data = await res.json();
      setProject(data.project);
      setCharacters(data.characters || []);
      setShots(data.shots || []);
    } catch (error) {
      console.error("Failed to fetch project:", error);
    } finally {
      setLoading(false);
    }
  };

  const startGenerate = async (action: string, options?: { idea?: string; style?: string; force?: boolean }) => {
    // script_generate 需要用户输入想法（如果没有提供 idea）
    if (action === "script_generate" && !options?.idea) {
      setShowIdeaDialog(true);
      return;
    }

    // 如果是强制重新生成，弹出确认对话框
    if (options?.force) {
      if (!confirm("确定要重新生成吗？之前的生成结果将被覆盖。")) {
        return;
      }
    }

    setGenerating(action);
    try {
      // 1. 创建任务
      const res = await fetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...options }),
      });
      const result = await res.json();

      if (!result.success) {
        alert(`创建任务失败: ${result.error}`);
        setGenerating(null);
        return;
      }

      // 2. 启动任务执行
      await fetch("/api/tasks/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: result.taskId,
          projectId,
          action,
          ...options,
        }),
      });

      // 3. 开始轮询
      setTaskProgress({
        taskId: result.taskId,
        type: action,
        status: "running",
        progress: 0,
      });
      setPollingActive(true);
    } catch (error) {
      console.error("Generation failed:", error);
      alert("生成失败，请重试");
      setGenerating(null);
    }
  };

  // 提交 AI 生成剧本
  const handleIdeaSubmit = async () => {
    if (!ideaText.trim()) {
      alert("请输入创作想法");
      return;
    }

    setShowIdeaDialog(false);
    await startGenerate("script_generate", { idea: ideaText, style: selectedStyle });
    setIdeaText("");
  };

  const cancelTask = async () => {
    if (!taskProgress?.taskId) return;
    
    try {
      await fetch(`/api/projects/${projectId}/tasks/${taskProgress.taskId}`, {
        method: "DELETE",
      });
      setPollingActive(false);
      setGenerating(null);
      setTaskProgress(null);
    } catch (error) {
      console.error("Failed to cancel task:", error);
    }
  };

  const handleScriptSave = async (newScript: string) => {
    await fetch(`/api/projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script: newScript }),
    });
    setProject({ ...project!, script: newScript });
    setEditingScript(false);
  };

  const handleShotSave = async (shot: Shot) => {
    await fetch(`/api/projects/${projectId}/shots/${shot.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(shot),
    });
    
    // 更新本地状态
    setShots(shots.map(s => s.id === shot.id ? shot : s));
    setEditingShot(null);
  };

  const handleCharSave = async (char: Character) => {
    await fetch(`/api/projects/${projectId}/characters/${char.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(char),
    });
    setCharacters(characters.map(c => c.id === char.id ? char : c));
    setEditingChar(null);
  };

  const handleCharDelete = async (charId: string) => {
    if (!confirm("确定要删除这个角色吗？")) return;
    
    await fetch(`/api/projects/${projectId}/characters/${charId}`, {
      method: "DELETE",
    });
    setCharacters(characters.filter(c => c.id !== charId));
  };

  const handleShotDelete = async (shotId: string) => {
    if (!confirm("确定要删除这个分镜吗？")) return;
    
    await fetch(`/api/projects/${projectId}/shots/${shotId}`, {
      method: "DELETE",
    });
    setShots(shots.filter(s => s.id !== shotId));
  };

  const getStepStatus = useCallback((action: string): "completed" | "current" | "pending" | "disabled" => {
    if (!project) return "disabled";

    switch (action) {
      case "script_generate":
      case "script_parse":
        // 剧本相关：始终可用（script_generate需要idea，script_parse需要已有剧本）
        return project.script ? "completed" : "pending";
      
      case "character_extract":
        // 角色提取：需要剧本作为输入
        return project.script ? (characters.length > 0 ? "completed" : "current") : "disabled";
      
      case "character_image":
        // 角色图：需要角色作为输入
        return characters.length > 0 
          ? (characters.some(c => c.referenceImage) ? "completed" : "current")
          : "disabled";
      
      case "shot_split":
        // 分镜拆分：需要剧本或角色
        return (project.script || characters.length > 0)
          ? (shots.length > 0 ? "completed" : "current")
          : "disabled";
      
      case "frame_generate":
        // 帧图生成：需要分镜
        return shots.length > 0
          ? (shots.some(s => s.firstFrame || s.lastFrame) ? "completed" : "current")
          : "disabled";
      
      case "video_generate":
        // 视频生成：需要帧图
        return shots.some(s => s.firstFrame && s.lastFrame)
          ? (shots.some(s => s.videoUrl) ? "completed" : "current")
          : "disabled";
      
      case "video_assemble":
        // 视频合成：需要分镜视频
        return shots.some(s => s.videoUrl)
          ? (project.finalVideoUrl ? "completed" : "current")
          : "disabled";
      
      default:
        return "disabled";
    }
  }, [project, characters, shots]);

  const pipelineSteps: PipelineStep[] = [
    { key: "script_generate", name: "AI生成剧本", icon: Sparkles, action: "script_generate", description: "根据想法生成完整剧本" },
    { key: "script_parse", name: "剧本解析", icon: Sparkles, action: "script_parse", description: "解析剧本结构" },
    { key: "character", name: "角色提取", icon: Users, action: "character_extract", description: "提取角色信息" },
    { key: "character_image", name: "角色图", icon: Image, action: "character_image", description: "生成角色参考图" },
    { key: "shots", name: "分镜拆分", icon: Film, action: "shot_split", description: "拆分镜头序列" },
    { key: "frames", name: "帧图生成", icon: Image, action: "frame_generate", description: "生成首尾帧" },
    { key: "videos", name: "视频生成", icon: Film, action: "video_generate", description: "生成动画视频" },
    { key: "assemble", name: "视频合成", icon: Play, action: "video_assemble", description: "合成最终成片" },
  ];

  const renderTaskProgress = () => {
    if (!taskProgress || !pollingActive) return null;

    return (
      <Card className="mb-4 border-blue-200 bg-blue-50">
        <CardContent className="pt-4">
          <div className="flex items-center gap-4">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            <div className="flex-1">
              <p className="font-medium text-blue-700">
                {taskProgress.currentStep || "处理中..."}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-2 bg-blue-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${taskProgress.progress}%` }}
                  />
                </div>
                <span className="text-sm text-blue-600">{taskProgress.progress}%</span>
              </div>
              {taskProgress.totalSteps && (
                <p className="text-xs text-blue-500 mt-1">
                  步骤 {taskProgress.currentStepIndex! + 1} / {taskProgress.totalSteps}
                </p>
              )}
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={cancelTask}
              className="text-red-500 border-red-200 hover:bg-red-50"
            >
              <StopCircle className="w-4 h-4 mr-1" />
              取消
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardContent className="py-8 text-center">
            <p>项目不存在</p>
            <Button className="mt-4" onClick={() => router.push("/")}>
              返回首页
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/")}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{project.title}</h1>
          </div>
          <Badge className={
            project.status === "completed" ? "bg-green-500" :
            project.status === "processing" ? "bg-yellow-500" : "bg-gray-500"
          }>
            {project.status === "completed" ? "已完成" :
             project.status === "processing" ? "处理中" : "草稿"}
          </Badge>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {renderTaskProgress()}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Pipeline Panel */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">生成流水线</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {pipelineSteps.map((step, index) => {
                  const status = getStepStatus(step.action);
                  // 只有 disabled 状态才禁用按钮，已完成也可以重新执行
                  const isDisabled = status === "disabled";
                  const isRunning = generating === step.action;
                  const isCompleted = status === "completed";

                  // 获取前置条件提示
                  const getPrerequisiteHint = (action: string): string => {
                    switch (action) {
                      case "character_extract":
                        return "需要剧本内容";
                      case "character_image":
                        return "需要先提取角色";
                      case "shot_split":
                        return "需要剧本或角色信息";
                      case "frame_generate":
                        return "需要分镜数据";
                      case "video_generate":
                        return "需要生成帧图";
                      case "video_assemble":
                        return "需要生成视频";
                      default:
                        return "";
                    }
                  };

                  return (
                    <div key={step.key} className="flex items-center gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          status === "completed" ? "bg-green-500 text-white" :
                          status === "current" ? "bg-blue-500 text-white" :
                          status === "disabled" ? "bg-gray-100 text-gray-300" :
                          "bg-gray-200 text-gray-500"
                        }`}>
                          {status === "completed" ? (
                            <CheckCircle className="w-5 h-5" />
                          ) : (
                            <step.icon className="w-5 h-5" />
                          )}
                        </div>
                        {index < pipelineSteps.length - 1 && (
                          <div className={`w-0.5 h-6 ${
                            status === "completed" ? "bg-green-500" : "bg-gray-200"
                          }`} />
                        )}
                      </div>
                      <div className="flex-1 py-2">
                        <p className={`font-medium ${
                          status === "disabled" ? "text-gray-400" :
                          status === "pending" ? "text-gray-500" : ""
                        }`}>{step.name}</p>
                        <p className={`text-xs ${
                          status === "disabled" ? "text-gray-400" : "text-gray-500"
                        }`}>
                          {status === "disabled" ? getPrerequisiteHint(step.action) : step.description}
                        </p>
                      </div>
                      {/* 所有非 disabled 阶段都可以点击执行 */}
                      {status !== "disabled" && (
                        <Button
                          size="sm"
                          variant={isCompleted ? "ghost" : "outline"}
                          disabled={isDisabled || isRunning || generating !== null}
                          onClick={() => startGenerate(step.action, { force: isCompleted })}
                          className={isCompleted ? "text-orange-500" : ""}
                          title={isCompleted ? "重新生成" : "生成"}
                        >
                          {isRunning ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  );
                })}

                {/* Quick Actions */}
                <div className="pt-4 border-t mt-4">
                  <Button
                    className="w-full"
                    size="lg"
                    disabled={!project.script || generating !== null}
                    onClick={() => startGenerate("full_pipeline")}
                  >
                    {generating ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-2" />
                    )}
                    一键生成全部
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Final Video */}
            {project.finalVideoUrl && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-lg">最终成片</CardTitle>
                </CardHeader>
                <CardContent>
                  <video
                    src={project.finalVideoUrl}
                    controls
                    className="w-full rounded-lg"
                  />
                  <Button className="w-full mt-4" variant="outline">
                    下载视频
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">概览</TabsTrigger>
                <TabsTrigger value="characters">角色 ({characters.length})</TabsTrigger>
                <TabsTrigger value="shots">分镜 ({shots.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>剧本</CardTitle>
                    {!editingScript ? (
                      <Button size="sm" variant="ghost" onClick={() => setEditingScript(true)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setEditingScript(false)}>
                          <X className="w-4 h-4" />
                        </Button>
                        <Button size="sm" onClick={() => handleScriptSave(project.script)}>
                          <Save className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    {editingScript ? (
                      <Textarea
                        value={project.script || ""}
                        onChange={(e) => setProject({ ...project, script: e.target.value })}
                        className="min-h-[300px]"
                        placeholder="输入或粘贴剧本内容..."
                      />
                    ) : (
                      <Textarea
                        value={project.script || ""}
                        readOnly
                        className="min-h-[300px]"
                        placeholder="输入或粘贴剧本内容..."
                      />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="characters" className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {characters.map((char) => (
                    <Card key={char.id}>
                      {editingChar?.id === char.id ? (
                        <CardContent className="pt-4 space-y-3">
                          <Input
                            value={editingChar.name}
                            onChange={(e) => setEditingChar({ ...editingChar, name: e.target.value })}
                            placeholder="角色名称"
                          />
                          <Input
                            value={editingChar.visualHint}
                            onChange={(e) => setEditingChar({ ...editingChar, visualHint: e.target.value })}
                            placeholder="视觉描述"
                          />
                          <Textarea
                            value={editingChar.description}
                            onChange={(e) => setEditingChar({ ...editingChar, description: e.target.value })}
                            placeholder="角色描述"
                            rows={3}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleCharSave(editingChar)}>
                              保存
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingChar(null)}>
                              取消
                            </Button>
                          </div>
                        </CardContent>
                      ) : (
                        <CardContent className="pt-4">
                          <div className="flex items-start gap-4">
                            {char.referenceImage ? (
                              <div className="relative">
                                <img
                                  src={getFileUrl(char.referenceImage) || ""}
                                  alt={char.name}
                                  className="w-24 h-24 object-cover rounded-lg"
                                />
                                <Button 
                                  size="sm" 
                                  variant="secondary"
                                  className="absolute -bottom-2 -right-2 h-8 w-8 p-0 rounded-full shadow-md"
                                  disabled={generating !== null}
                                  onClick={() => startGenerateWithShot("character_image", char.id)}
                                  title="重绘角色图"
                                >
                                  <Loader2 className="w-3 h-3 text-orange-500" />
                                </Button>
                              </div>
                            ) : (
                              <Button 
                                size="sm" 
                                variant="outline"
                                className="w-24 h-24 rounded-lg border-dashed"
                                disabled={generating !== null}
                                onClick={() => startGenerateWithShot("character_image", char.id)}
                              >
                                <div className="flex flex-col items-center">
                                  <Image className="w-6 h-6 mb-1" />
                                  <span className="text-xs">生成</span>
                                </div>
                              </Button>
                            )}
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <h3 className="font-semibold">{char.name}</h3>
                                <div className="flex gap-1">
                                  <Button size="sm" variant="ghost" onClick={() => setEditingChar(char)}>
                                    <Edit2 className="w-3 h-3" />
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => handleCharDelete(char.id)}>
                                    <Trash2 className="w-3 h-3 text-red-500" />
                                  </Button>
                                </div>
                              </div>
                              <Badge variant="outline" className="mt-1">
                                {char.scope === "main" ? "主角" : "配角"}
                              </Badge>
                              {char.visualHint && (
                                <p className="text-sm text-gray-500 mt-1">
                                  {char.visualHint}
                                </p>
                              )}
                            </div>
                          </div>
                          {char.description && (
                            <p className="text-sm text-gray-600 mt-3 line-clamp-3">
                              {char.description}
                            </p>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  ))}
                  
                  {/* Add Character Button */}
                  <Card className="border-dashed">
                    <CardContent className="pt-4 flex flex-col items-center justify-center py-12 cursor-pointer hover:bg-gray-50"
                      onClick={() => setEditingChar({
                        id: "new",
                        name: "",
                        description: "",
                        visualHint: "",
                        referenceImage: null,
                        scope: "main",
                      })}
                    >
                      <Plus className="w-8 h-8 text-gray-400 mb-2" />
                      <p className="text-gray-500">添加角色</p>
                    </CardContent>
                  </Card>

                  {characters.length === 0 && !editingChar && (
                    <Card className="col-span-full">
                      <CardContent className="py-12 text-center text-gray-500">
                        <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>暂无角色，请先进行剧本解析或手动添加</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="shots" className="mt-4">
                <div className="space-y-4">
                  {shots.map((shot) => (
                    <Card key={shot.id}>
                      {editingShot?.id === shot.id ? (
                        <CardContent className="pt-4 space-y-3">
                          <div>
                            <label className="text-sm font-medium">场景描述</label>
                            <Textarea
                              value={editingShot.sceneDescription}
                              onChange={(e) => setEditingShot({ ...editingShot, sceneDescription: e.target.value })}
                              rows={2}
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium">首帧描述</label>
                            <Textarea
                              value={editingShot.startFrameDesc || ""}
                              onChange={(e) => setEditingShot({ ...editingShot, startFrameDesc: e.target.value })}
                              placeholder="描述首帧画面内容..."
                              rows={2}
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium">尾帧描述</label>
                            <Textarea
                              value={editingShot.endFrameDesc || ""}
                              onChange={(e) => setEditingShot({ ...editingShot, endFrameDesc: e.target.value })}
                              placeholder="描述尾帧画面内容..."
                              rows={2}
                            />
                          </div>
                          <div className="flex gap-2">
                            <Input
                              value={editingShot.cameraDirection}
                              onChange={(e) => setEditingShot({ ...editingShot, cameraDirection: e.target.value })}
                              placeholder="运镜方向"
                              className="w-32"
                            />
                            <Input
                              type="number"
                              value={editingShot.duration}
                              onChange={(e) => setEditingShot({ ...editingShot, duration: parseInt(e.target.value) || 5 })}
                              placeholder="时长"
                              className="w-20"
                            />
                            <span className="self-center text-gray-500">秒</span>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleShotSave(editingShot)}>
                              保存
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingShot(null)}>
                              取消
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="text-red-500"
                              onClick={() => {
                                handleShotDelete(shot.id);
                                setEditingShot(null);
                              }}
                            >
                              删除
                            </Button>
                          </div>
                        </CardContent>
                      ) : (
                        <CardContent className="pt-4">
                          <div className="flex items-center gap-4 mb-4">
                            <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
                              {shot.sequence}
                            </div>
                            <div className="flex-1">
                              <p className="text-sm text-gray-500 line-clamp-1">
                                {shot.sceneDescription || "未描述"}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="ghost" onClick={() => setEditingShot(shot)}>
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleShotDelete(shot.id)}>
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                            <Badge variant="outline">{shot.duration}s</Badge>
                            <Badge className={
                              shot.status === "completed" ? "bg-green-500" :
                              shot.status === "generating" ? "bg-yellow-500" :
                              shot.status === "failed" ? "bg-red-500" : "bg-gray-500"
                            }>
                              {shot.status === "completed" ? "已完成" :
                               shot.status === "generating" ? "生成中" :
                               shot.status === "failed" ? "失败" : "待处理"}
                            </Badge>
                          </div>

                          {/* Shot Editable Fields */}
                          <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                            <div>
                              <p className="text-gray-500 font-medium">首帧描述：</p>
                              <p className="text-gray-700">{shot.startFrameDesc || "未设置"}</p>
                            </div>
                            <div>
                              <p className="text-gray-500 font-medium">尾帧描述：</p>
                              <p className="text-gray-700">{shot.endFrameDesc || "未设置"}</p>
                            </div>
                          </div>

                          {/* Frames Preview */}
                          <div className="grid grid-cols-3 gap-4 mb-4">
                            <div>
                              <p className="text-xs text-gray-500 mb-1">首帧</p>
                              {shot.firstFrame ? (
                                <img
                                  src={getFileUrl(shot.firstFrame) || ""}
                                  alt="首帧"
                                  className="w-full aspect-video object-cover rounded"
                                />
                              ) : (
                                <div className="w-full aspect-video bg-gray-100 rounded flex items-center justify-center">
                                  <Image className="w-6 h-6 text-gray-400" />
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 mb-1">尾帧</p>
                              {shot.lastFrame ? (
                                <img
                                  src={getFileUrl(shot.lastFrame) || ""}
                                  alt="尾帧"
                                  className="w-full aspect-video object-cover rounded"
                                />
                              ) : (
                                <div className="w-full aspect-video bg-gray-100 rounded flex items-center justify-center">
                                  <Image className="w-6 h-6 text-gray-400" />
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 mb-1">视频</p>
                              {shot.videoUrl ? (
                                <video
                                  src={getFileUrl(shot.videoUrl) || ""}
                                  className="w-full aspect-video object-cover rounded"
                                  muted
                                />
                              ) : (
                                <div className="w-full aspect-video bg-gray-100 rounded flex items-center justify-center">
                                  <Film className="w-6 h-6 text-gray-400" />
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Shot Actions */}
                          <div className="flex gap-2 flex-wrap">
                            {/* 首帧生成/重生成 */}
                            <Button 
                              size="sm" 
                              variant={shot.firstFrame ? "ghost" : "outline"}
                              disabled={generating !== null}
                              onClick={() => startGenerateWithShot("frame_generate", shot.id)}
                              className={shot.firstFrame ? "text-orange-500" : ""}
                            >
                              {shot.firstFrame ? <Loader2 className="w-4 h-4 mr-1" /> : <Image className="w-4 h-4 mr-1" />}
                              {shot.firstFrame ? "重绘首帧" : "生成首帧"}
                            </Button>
                            
                            {/* 尾帧生成/重生成 */}
                            {shot.endFrameDesc && (
                              <Button 
                                size="sm" 
                                variant={shot.lastFrame ? "ghost" : "outline"}
                                disabled={generating !== null}
                                onClick={() => startGenerateWithShot("frame_generate", shot.id)}
                                className={shot.lastFrame ? "text-orange-500" : ""}
                              >
                                {shot.lastFrame ? <Loader2 className="w-4 h-4 mr-1" /> : <Image className="w-4 h-4 mr-1" />}
                                {shot.lastFrame ? "重绘尾帧" : "生成尾帧"}
                              </Button>
                            )}
                            
                            {/* 视频生成 */}
                            {shot.firstFrame && shot.lastFrame && !shot.videoUrl && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                disabled={generating !== null}
                                onClick={() => startGenerateWithShot("video_generate", shot.id)}
                              >
                                <Film className="w-4 h-4 mr-1" />
                                生成视频
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  ))}
                  {shots.length === 0 && (
                    <Card>
                      <CardContent className="py-12 text-center text-gray-500">
                        <Film className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>暂无分镜，请先进行分镜拆分</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      {/* AI 生成剧本对话框 */}
      <Dialog open={showIdeaDialog} onOpenChange={setShowIdeaDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-500" />
              AI 生成剧本
            </DialogTitle>
            <DialogDescription>
              描述你的创作想法，AI 将为你生成完整的剧本内容
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">创作想法</label>
              <Textarea
                value={ideaText}
                onChange={(e) => setIdeaText(e.target.value)}
                placeholder="例如：一个年轻的女魔法师在小村庄里发现了一个神秘的传送门..."
                rows={6}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">风格</label>
              <div className="flex gap-2 flex-wrap">
                {[
                  { value: "anime", label: "日漫" },
                  { value: "realistic", label: "写实" },
                  { value: "3d", label: "3D风格" },
                  { value: "cartoon", label: "卡通" },
                ].map((style) => (
                  <Button
                    key={style.value}
                    size="sm"
                    variant={selectedStyle === style.value ? "default" : "outline"}
                    onClick={() => setSelectedStyle(style.value)}
                  >
                    {style.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowIdeaDialog(false)}>
              取消
            </Button>
            <Button onClick={handleIdeaSubmit} disabled={!ideaText.trim()}>
              <Sparkles className="w-4 h-4 mr-1" />
              开始生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  // 辅助函数：针对单个分镜生成
  async function startGenerateWithShot(action: string, shotId: string) {
    setGenerating(action);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, shotId }),
      });
      const result = await res.json();

      if (!result.success) {
        alert(`创建任务失败: ${result.error}`);
        setGenerating(null);
        return;
      }

      await fetch("/api/tasks/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: result.taskId,
          projectId,
          action,
          shotId,
        }),
      });

      setTaskProgress({
        taskId: result.taskId,
        type: action,
        status: "running",
        progress: 0,
      });
      setPollingActive(true);
    } catch (error) {
      console.error("Generation failed:", error);
      alert("生成失败，请重试");
      setGenerating(null);
    }
  }
}
