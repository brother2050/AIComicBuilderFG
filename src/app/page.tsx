"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Plus, 
  Film, 
  Play, 
  Sparkles, 
  Trash2, 
  Loader2,
  Image,
  Users,
  Clapperboard,
  Copy,
  Settings,
  Wand2,
  FileText,
  Lightbulb
} from "lucide-react";

interface Project {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: { title: string; script?: string; idea?: string; style: string }) => void;
  onGenerateScript: (data: { title: string; idea: string; style: string }) => Promise<void>;
  generating: boolean;
}

function NewProjectDialog({ 
  open, 
  onOpenChange, 
  onCreate, 
  onGenerateScript,
  generating 
}: NewProjectDialogProps) {
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [idea, setIdea] = useState("");
  const [style, setStyle] = useState("anime");
  const [tab, setTab] = useState<"script" | "idea">("idea");

  if (!open) return null;

  const handleScriptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({ title, script, style });
    setTitle("");
    setScript("");
    onOpenChange(false);
  };

  const handleIdeaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onGenerateScript({ title, idea, style });
    setTitle("");
    setIdea("");
    onOpenChange(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-auto">
        <CardHeader>
          <CardTitle>创建新项目</CardTitle>
          <CardDescription>
            {tab === "idea" 
              ? "输入你的想法，AI将为你生成完整剧本" 
              : "输入剧本内容，AI将自动解析角色和分镜"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as "script" | "idea")}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="idea" className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4" />
                AI生成剧本
              </TabsTrigger>
              <TabsTrigger value="script" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                粘贴剧本
              </TabsTrigger>
            </TabsList>

            {/* AI生成剧本选项卡 */}
            <TabsContent value="idea">
              <form onSubmit={handleIdeaSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium">项目标题</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="输入项目标题（可选，AI会生成）"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">风格</label>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {[
                      { value: "anime", label: "日漫", desc: "注重情感、视觉冲击" },
                      { value: "realistic", label: "写实", desc: "真实细腻、注重细节" },
                      { value: "3d", label: "3D", desc: "立体感强、动作流畅" },
                      { value: "cartoon", label: "卡通", desc: "色彩鲜艳、可爱" },
                    ].map((s) => (
                      <Button
                        key={s.value}
                        type="button"
                        variant={style === s.value ? "default" : "outline"}
                        onClick={() => setStyle(s.value)}
                        className="flex flex-col h-auto py-2 px-3"
                        title={s.desc}
                      >
                        <span className="capitalize">{s.label}</span>
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">创作想法</label>
                  <Textarea
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    placeholder={"描述你的故事想法...\n\n例如：\n- 一个年轻画家在咖啡店遇到了神秘的陌生女子\n- 穿越到古代的现代高中生成为宫廷画家\n- 机器人艺术家追求创作情感的故事"}
                    className="mt-1 min-h-[200px]"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    请详细描述故事情节、角色设定、场景等，AI会根据你的想法生成完整剧本
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    取消
                  </Button>
                  <Button type="submit" disabled={generating || !idea.trim()}>
                    {generating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        AI正在生成剧本...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4 mr-2" />
                        生成剧本并创建项目
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </TabsContent>

            {/* 粘贴剧本选项卡 */}
            <TabsContent value="script">
              <form onSubmit={handleScriptSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium">项目标题</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="输入项目标题"
                    className="mt-1"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">风格</label>
                  <div className="flex gap-2 mt-1">
                    {["anime", "realistic", "3d", "cartoon"].map((s) => (
                      <Button
                        key={s}
                        type="button"
                        variant={style === s ? "default" : "outline"}
                        onClick={() => setStyle(s)}
                        className="capitalize"
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">剧本内容</label>
                  <Textarea
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    placeholder="粘贴或输入剧本内容..."
                    className="mt-1 min-h-[200px]"
                    required
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    取消
                  </Button>
                  <Button type="submit">
                    <Sparkles className="w-4 h-4 mr-2" />
                    创建项目
                  </Button>
                </div>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

interface ProjectCardProps {
  project: Project;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

function ProjectCard({ project, onOpen, onDelete }: ProjectCardProps) {
  const statusColors: Record<string, string> = {
    draft: "bg-gray-500",
    processing: "bg-yellow-500",
    completed: "bg-green-500",
  };

  return (
    <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => onOpen(project.id)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{project.title}</CardTitle>
            <CardDescription className="mt-1">
              创建于 {new Date(project.createdAt).toLocaleDateString("zh-CN")}
            </CardDescription>
          </div>
          <Badge className={statusColors[project.status]}>
            {project.status === "draft" ? "草稿" : 
             project.status === "processing" ? "处理中" : "已完成"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(project.id);
              }}
            >
              <Film className="w-4 h-4 mr-1" />
              打开
            </Button>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(project.id);
            }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (data: { title: string; script?: string; idea?: string; style: string }) => {
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.project) {
        setProjects([result.project, ...projects]);
        // 如果有idea，跳转到项目页面
        if (data.idea) {
          router.push(`/project/${result.project.id}`);
        }
      }
    } catch (error) {
      console.error("Failed to create project:", error);
    } finally {
      setCreating(false);
    }
  };

  const handleGenerateScript = async (data: { title: string; idea: string; style: string }) => {
    setGenerating(true);
    let projectId = null;
    
    try {
      // 1. 创建项目
      const createRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: data.title || "AI生成剧本", style: data.style }),
      });
      const createResult = await createRes.json();

      if (!createResult.project) {
        throw new Error("Failed to create project");
      }

      projectId = createResult.project.id;

      // 2. 创建生成任务
      const taskRes = await fetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "script_generate", idea: data.idea, style: data.style }),
      });
      const taskResult = await taskRes.json();

      if (!taskResult.success) {
        throw new Error(taskResult.error || "Failed to start generation");
      }

      // 3. 启动任务执行
      await fetch("/api/tasks/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: taskResult.taskId,
          projectId,
          action: "script_generate",
          idea: data.idea,
          style: data.style,
        }),
      });

      // 4. 关闭对话框并跳转到项目页面
      // 任务将在后台继续执行
      router.push(`/project/${projectId}`);
    } catch (error) {
      console.error("Failed to generate script:", error);
      alert(error instanceof Error ? error.message : "生成剧本失败，请重试");
      
      // 如果已创建项目但生成失败，跳转到项目页面手动重试
      if (projectId) {
        router.push(`/project/${projectId}`);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!confirm("确定要删除这个项目吗？")) return;
    try {
      await fetch(`/api/projects/${id}`, { method: "DELETE" });
      setProjects(projects.filter((p) => p.id !== id));
    } catch (error) {
      console.error("Failed to delete project:", error);
    }
  };

  const handleOpenProject = (id: string) => {
    window.location.href = `/project/${id}`;
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Film className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">AI Comic Builder</h1>
              <p className="text-sm text-muted-foreground">AI漫剧生成器</p>
            </div>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            新建项目
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Copy, title: "剧本解析", desc: "AI自动解析剧本" },
            { icon: Users, title: "角色提取", desc: "智能提取角色" },
            { icon: Image, title: "帧图生成", desc: "首尾帧自动生成" },
            { icon: Clapperboard, title: "视频生成", desc: "AI视频合成" },
          ].map((feature) => (
            <Card key={feature.title} className="bg-gradient-to-br from-blue-50 to-purple-50 border-blue-100">
              <CardContent className="pt-4">
                <feature.icon className="w-8 h-8 text-blue-500 mb-2" />
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Projects */}
        <div className="mb-4">
          <h2 className="text-2xl font-bold mb-4">我的项目</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : projects.length === 0 ? (
          <Card className="py-20">
            <CardContent className="text-center">
              <Film className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-2">还没有项目</h3>
              <p className="text-muted-foreground mb-4">点击上方按钮创建你的第一个AI漫剧项目</p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                新建项目
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={handleOpenProject}
                onDelete={handleDeleteProject}
              />
            ))}
          </div>
        )}
      </main>

      {/* New Project Dialog */}
      <NewProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreate={handleCreateProject}
        onGenerateScript={handleGenerateScript}
        generating={generating}
      />
    </div>
  );
}
