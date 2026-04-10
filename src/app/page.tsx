"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Film, 
  Sparkles, 
  Trash2, 
  Loader2,
  Image,
  Users,
  Clapperboard,
  Copy,
  Settings
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
  onCreate: (data: { title: string; style: string; description?: string }) => void;
}

function NewProjectDialog({ 
  open, 
  onOpenChange, 
  onCreate, 
}: NewProjectDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState("anime");

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate({ title: title.trim(), style, description: description.trim() || undefined });
    setTitle("");
    setDescription("");
    onOpenChange(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>创建新项目</CardTitle>
          <CardDescription>
            剧本将在流水线页面操作，每一集可使用不同剧本
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
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
              <label className="text-sm font-medium">剧简介（可选）</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="简要描述故事背景、主题等..."
                className="mt-1 min-h-[80px]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={!title.trim()}>
                <Sparkles className="w-4 h-4 mr-2" />
                创建项目
              </Button>
            </div>
          </form>
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

  const handleCreateProject = async (data: { title: string; style: string; description?: string }) => {
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.project) {
        setProjects([result.project, ...projects]);
        router.push(`/project/${result.project.id}`);
      }
    } catch (error) {
      console.error("Failed to create project:", error);
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
      />
    </div>
  );
}
