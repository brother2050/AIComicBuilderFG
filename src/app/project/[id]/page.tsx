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
  Upload,
  Settings,
  Wand2,
  Box,
  UploadCloud,
  Layers,
  FileText,
} from "lucide-react";
import { getFileUrl } from "@/lib/utils";
import { TaskManager } from "@/components/TaskManager";

// 默认角色描述模板内容
const DEFAULT_CHARACTER_TEMPLATE = `You are a professional character designer and visual artist specializing in AI image generation.

TASK: Extract characters from the provided script and generate precise, professional visual descriptions optimized for AI image generation.

OUTPUT FORMAT (Strict JSON - no markdown, no additional text):
{
  "characters": [
    {
      "name": "Character Name",
      "scope": "main",
      "description": "A detailed visual description in English, focusing on: 1) Art style and genre, 2) Age and physical features (face, body type, height), 3) Hair (style, color, length), 4) Clothing and accessories, 5) Color palette and key visual elements, 6) Any distinctive marks or features",
      "visualHint": "A short 3-5 word search hint for quick image reference"
    }
  ]
}

DESCRIPTION RULES:
- Write in English for best AI image generation results
- Keep descriptions between 100-200 words
- Focus on visual, reproducible details (no abstract personality traits)
- Include specific color codes when important (e.g., #FF4500 for orange-red)
- Specify clothing details, accessories, and distinctive features
- Avoid metaphors or abstract concepts
- Example GOOD: "Young female warrior, 20s, slender athletic build. Long flowing silver hair tied in a high ponytail. Wearing dark navy armor with gold trim, shoulder plates with clan emblem. Carrying a curved katana at her hip. Left eye has a distinct red scar."
- Example BAD: "A heroic protagonist who gained mysterious powers through scientific experiments, blending science and cultivation."

IMPORTANT:
- "description" MUST be a plain text string, NOT an object
- Return ONLY the JSON object, no explanations or markdown formatting
- Each character description should be self-contained and complete`;

interface Character {
  id: string;
  name: string;
  description: string;
  visualHint: string;
  visualDescription: string;
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
  scriptText?: string;
  totalEpisodes?: number;
  style: string;
  aspectRatio: string;
  status: string;
  finalVideoUrl: string | null;
  videoWorkflow: string | null;
}

interface WorkflowInfo {
  hasWorkflow: boolean;
  nodeCount: number;
  classTypes: string[];
  templateName?: string;
}

// 动态模板接口（从服务器获取）
interface DynamicTemplate {
  id: string;
  name: string;
  description: string;
  file: string;
  category: string;
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
  const [uploadingCharImage, setUploadingCharImage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [taskProgress, setTaskProgress] = useState<TaskProgress | null>(null);
  const [pollingActive, setPollingActive] = useState(false);
  const [scriptPreview, setScriptPreview] = useState("");
  const [activeEpisode, setActiveEpisode] = useState(1);

  // 编辑状态
  const [editingShot, setEditingShot] = useState<Shot | null>(null);
  const [editingChar, setEditingChar] = useState<Character | null>(null);
  const [editingScript, setEditingScript] = useState(false);

  // AI 生成剧本对话框
  const [showIdeaDialog, setShowIdeaDialog] = useState(false);
  const [ideaText, setIdeaText] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("anime");

  // 剧本输入对话框（包含两种模式：AI生成 & 粘贴剧本）
  const [showScriptDialog, setShowScriptDialog] = useState(false);
  const [scriptInputText, setScriptInputText] = useState("");
  const [scriptDialogTab, setScriptDialogTab] = useState<"idea" | "paste">("idea");

  // ===== 图片生成工作流设置 =====
  const [imageWorkflow, setImageWorkflow] = useState<{
    templateName: string | null;
    classTypes: string[];
  } | null>(null);
  const [availableImageWorkflows, setAvailableImageWorkflows] = useState<any[]>([]);
  const [imageWorkflowLoading, setImageWorkflowLoading] = useState(false);
  const [imageWorkflowParams, setImageWorkflowParams] = useState({
    width: 1024,
    height: 1024,
    steps: 8,
    workflowFile: "image_z_image_turbo.json",
  });

  // ===== 视频生成工作流设置 =====
  const [videoWorkflow, setVideoWorkflow] = useState<{
    templateName: string | null;
    classTypes: string[];
  } | null>(null);
  const [availableVideoWorkflows, setAvailableVideoWorkflows] = useState<any[]>([]);
  const [videoWorkflowLoading, setVideoWorkflowLoading] = useState(false);
  const [showImageWorkflowSection, setShowImageWorkflowSection] = useState(false);
  const [showVideoWorkflowSection, setShowVideoWorkflowSection] = useState(false);

  // 角色模板相关
  const [charTemplates, setCharTemplates] = useState<any[]>([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [showTemplateSettings, setShowTemplateSettings] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);

  // 轮询任务进度
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;

    const pollTaskStatus = async () => {
      if (!taskProgress?.taskId) return;

      try {
        const res = await fetch(`/api/projects/${projectId}/tasks?taskId=${taskProgress.taskId}`, {
          cache: "no-store"
        });
        
        if (!res.ok) {
          console.error("Failed to poll task status:", res.status);
          return;
        }

        const data = await res.json();
        if (data.task) {
          const newStatus = data.task.status;
          setTaskProgress(data.task);

          // 如果是剧本生成任务，获取流式预览
          const isScriptGeneration = data.task.type === "script_parse" &&
            (data.task.currentStep?.includes("剧本文本") || data.task.currentStep?.includes("解析"));

          // 任务完成时停止轮询并刷新
          if (newStatus === "completed" || newStatus === "failed") {
            setPollingActive(false);
            setGenerating(null);
            setScriptPreview(""); // 清除预览
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
          } else if (isScriptGeneration || data.task.type === "script_parse") {
            // 剧本生成任务进行中，获取预览文本
            await fetch(`/api/projects/${projectId}`, { cache: "no-store" })
              .then(r => r.json())
              .then(d => {
                if (d.project?.scriptText) {
                  setScriptPreview(d.project.scriptText);
                }
              });
          } else {
            // 其他图片生成任务，持续刷新数据以显示生成进度
            const isImageGeneration = ["frame_generate", "character_image"].includes(data.task.type);
            if (isImageGeneration) {
              await fetch(`/api/projects/${projectId}`, { cache: "no-store" })
                .then(r => r.json())
                .then(d => {
                  setProject(d.project);
                  setCharacters(d.characters || []);
                  setShots(d.shots || []);
                });
            }
          }
        }
      } catch (error) {
        console.error("Failed to poll task status:", error);
      }
    };

    if (pollingActive && taskProgress?.taskId) {
      // 立即执行一次
      pollTaskStatus();
      // 然后每2秒轮询
      pollInterval = setInterval(pollTaskStatus, 2000);
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [pollingActive, taskProgress?.taskId, projectId, taskProgress?.type]);

  // 页面卸载时停止轮询
  useEffect(() => {
    return () => {
      setPollingActive(false);
      setGenerating(null);
    };
  }, []);

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

  // ===== 角色模板函数 =====
  const fetchCharTemplates = async () => {
    setTemplateLoading(true);
    try {
      const res = await fetch(`/api/templates?category=character`);
      const data = await res.json();
      if (data.templates) {
        setCharTemplates(data.templates);
      }
    } catch (error) {
      console.error("Failed to fetch templates:", error);
    } finally {
      setTemplateLoading(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;
    try {
      if (editingTemplate.id) {
        await fetch(`/api/templates/${editingTemplate.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editingTemplate),
        });
      }
      setEditingTemplate(null);
      fetchCharTemplates();
    } catch (error) {
      console.error("Failed to save template:", error);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm("确定要删除这个模板吗？")) return;
    try {
      await fetch(`/api/templates/${templateId}`, { method: "DELETE" });
      fetchCharTemplates();
    } catch (error) {
      console.error("Failed to delete template:", error);
    }
  };

  const handleCreateTemplate = () => {
    setEditingTemplate({
      id: undefined,
      name: "",
      description: "",
      systemPrompt: "",
      isDefault: false,
      category: "character",
    });
  };

  // ===== 图片工作流函数 =====
  const fetchImageWorkflows = async () => {
    setImageWorkflowLoading(true);
    try {
      // 获取可用模板列表
      const templatesRes = await fetch(`/api/templates/comfyui-workflow?category=image`);
      const templatesData = await templatesRes.json();
      if (templatesData.templates) {
        setAvailableImageWorkflows(templatesData.templates);
      }
      // 获取项目已配置的工作流
      const workflowRes = await fetch(`/api/projects/${projectId}/workflow?type=image`);
      const workflowData = await workflowRes.json();
      if (workflowData.hasWorkflow) {
        setImageWorkflow({
          templateName: workflowData.templateName || null,
          classTypes: workflowData.classTypes || [],
        });
      } else {
        setImageWorkflow(null);
      }
    } catch (error) {
      console.error("Failed to fetch image workflows:", error);
    } finally {
      setImageWorkflowLoading(false);
    }
  };

  const handleImageWorkflowSelect = async (workflowId: string) => {
    try {
      // 获取该工作流的默认参数
      const res = await fetch(`/api/templates/comfyui-workflow?id=${workflowId}`);
      const data = await res.json();
      const params = data.template?.params || {};
      setImageWorkflowParams(prev => ({
        ...prev,
        workflowFile: workflowId,
        width: params.width?.default || 1024,
        height: params.height?.default || 1024,
        steps: params.steps?.default || 20,
      }));
      // 保存到项目
      await fetch(`/api/projects/${projectId}/workflow`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageWorkflowParams: { ...imageWorkflowParams, workflowFile: workflowId },
          type: "image",
        }),
      });
      setImageWorkflow({ templateName: workflowId, classTypes: [] });
      alert("图片工作流已切换");
    } catch (error) {
      console.error("Failed to select image workflow:", error);
    }
  };

  const handleSaveImageWorkflowParams = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/workflow`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageWorkflowParams,
          type: "image",
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert("参数已保存");
      } else {
        alert(`保存失败: ${data.error}`);
      }
    } catch (error) {
      console.error("Failed to save params:", error);
    }
  };

  const handleClearImageWorkflow = async () => {
    if (!confirm("确定要清除图片工作流配置吗？")) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/workflow`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow: null, type: "image" }),
      });
      const data = await res.json();
      if (data.success) {
        setImageWorkflow(null);
        alert("图片工作流已清除");
      }
    } catch (error) {
      console.error("Failed to clear workflow:", error);
    }
  };

  // ===== 视频工作流函数 =====
  const fetchVideoWorkflows = async () => {
    setVideoWorkflowLoading(true);
    try {
      // 获取可用模板列表
      const templatesRes = await fetch(`/api/templates/comfyui-workflow?category=video`);
      const templatesData = await templatesRes.json();
      if (templatesData.templates) {
        setAvailableVideoWorkflows(templatesData.templates);
      }
      // 获取项目已配置的工作流
      const workflowRes = await fetch(`/api/projects/${projectId}/workflow?type=video`);
      const workflowData = await workflowRes.json();
      if (workflowData.hasWorkflow) {
        setVideoWorkflow({
          templateName: workflowData.templateName || null,
          classTypes: workflowData.classTypes || [],
        });
      } else {
        setVideoWorkflow(null);
      }
    } catch (error) {
      console.error("Failed to fetch video workflows:", error);
    } finally {
      setVideoWorkflowLoading(false);
    }
  };

  const handleVideoWorkflowSelect = async (workflowId: string) => {
    try {
      await fetch(`/api/projects/${projectId}/workflow`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflow: { _workflowFile: workflowId },
          templateName: workflowId,
          type: "video",
        }),
      });
      setVideoWorkflow({ templateName: workflowId, classTypes: [] });
      alert("视频工作流已切换");
    } catch (error) {
      console.error("Failed to select video workflow:", error);
    }
  };

  const handleClearVideoWorkflow = async () => {
    if (!confirm("确定要清除视频工作流配置吗？")) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/workflow`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow: null, type: "video" }),
      });
      const data = await res.json();
      if (data.success) {
        setVideoWorkflow(null);
        alert("视频工作流已清除");
      }
    } catch (error) {
      console.error("Failed to clear workflow:", error);
    }
  };

  // 初始化加载
  useEffect(() => {
    fetchProject();
    fetchImageWorkflows();
    fetchVideoWorkflows();
  }, [projectId]);

  const startGenerate = async (action: string, options?: { idea?: string; style?: string; force?: boolean; episode?: number }) => {
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
        body: JSON.stringify({ action, ...options, episode: options?.episode || activeEpisode }),
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
          episode: options?.episode || activeEpisode,
          idea: options?.idea,
          style: options?.style,
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

  // 提交剧本（粘贴模式）
  const handleScriptPasteSubmit = async () => {
    if (!scriptInputText.trim()) {
      alert("请输入剧本内容");
      return;
    }

    setShowScriptDialog(false);
    await handleScriptSave(scriptInputText);
    setScriptInputText("");
  };

  // 提交剧本（AI生成模式）
  const handleScriptDialogIdeaSubmit = async () => {
    if (!ideaText.trim()) {
      alert("请输入创作想法");
      return;
    }

    setShowScriptDialog(false);
    await startGenerate("script_generate", { idea: ideaText, style: selectedStyle });
    setIdeaText("");
  };

  // 打开剧本对话框（用于流水线点击）
  const openScriptDialog = () => {
    // 如果已有剧本，询问是重新生成还是编辑
    if (project?.script) {
      setScriptInputText(project.script);
      setScriptDialogTab("paste");
    } else {
      setScriptDialogTab("idea");
      setIdeaText("");
    }
    setShowScriptDialog(true);
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
      body: JSON.stringify({ scriptText: newScript }),
    });
    setProject({ ...project!, scriptText: newScript });
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

  // 上传角色图
  const handleCharImageUpload = async (charId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingCharImage(charId);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/projects/${projectId}/characters/${charId}/upload-image`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        // 更新本地状态
        setCharacters(characters.map(c => 
          c.id === charId ? { ...c, referenceImage: data.path } : c
        ));
      } else {
        alert(`上传失败: ${data.error}`);
      }
    } catch (error) {
      console.error("Failed to upload character image:", error);
      alert("上传失败，请重试");
    } finally {
      setUploadingCharImage(null);
      event.target.value = "";
    }
  };

  // 生成单集剧本
  const handleGenerateEpisode = async (episode: number) => {
    if (!ideaText.trim()) {
      alert("请先输入创作想法");
      return;
    }

    setGenerating("script_generate");
    try {
      const res = await fetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "script_generate", 
          idea: ideaText, 
          style: selectedStyle,
          episode 
        }),
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
          action: "script_generate",
          idea: ideaText,
          style: selectedStyle,
          episode,
        }),
      });

      setTaskProgress({
        taskId: result.taskId,
        type: "script_generate",
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

    const isScriptTask = taskProgress.type === "script_parse" || generating === "script_generate";

    return (
      <Card className="mb-4 border-blue-200 bg-blue-50">
        <CardContent className="pt-4">
          <div className="flex items-center gap-4 mb-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500 shrink-0" />
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
              className="text-red-500 border-red-200 hover:bg-red-50 shrink-0"
            >
              <StopCircle className="w-4 h-4 mr-1" />
              取消
            </Button>
          </div>

          {/* 剧本预览（仅剧本生成任务显示） */}
          {isScriptTask && scriptPreview && (
            <div className="bg-white rounded-lg p-3 border border-blue-100 max-h-48 overflow-auto">
              <p className="text-xs text-gray-500 mb-2">剧本预览（生成中...）</p>
              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans">
                {scriptPreview.slice(-2000)}
              </pre>
            </div>
          )}
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
          <TaskManager projectId={projectId} />
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
                          onClick={() => {
                            // 剧本生成步骤：弹出选择对话框
                            if (step.action === "script_generate" || step.action === "script_parse") {
                              openScriptDialog();
                            } else {
                              startGenerate(step.action, { force: isCompleted });
                            }
                          }}
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

                {/* 工作流设置 */}
                <Card className="mt-4">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Settings className="w-4 h-4" />
                        <CardTitle className="text-base">工作流设置</CardTitle>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          fetchImageWorkflows();
                          fetchVideoWorkflows();
                        }}
                      >
                        <Sparkles className="w-4 h-4 mr-1" />
                        刷新
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* 图片生成工作流 */}
                    <div className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Image className="w-4 h-4" />
                          <span className="font-medium text-sm">图片生成工作流</span>
                          {imageWorkflow && (
                            <Badge variant="outline" className="ml-2 bg-green-50 text-green-600 border-green-200 text-xs">
                              已配置
                            </Badge>
                          )}
                        </div>
                        <button
                          className="text-xs text-blue-500 hover:text-blue-700"
                          onClick={() => setShowImageWorkflowSection(!showImageWorkflowSection)}
                        >
                          {showImageWorkflowSection ? "收起" : "展开"}
                        </button>
                      </div>
                      {showImageWorkflowSection && (
                        <div className="space-y-3">
                          {imageWorkflowLoading ? (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="w-5 h-5 animate-spin text-gray-400 mr-2" />
                              <span className="text-sm text-gray-500">加载中...</span>
                            </div>
                          ) : (
                            <>
                              <select
                                value={imageWorkflowParams.workflowFile}
                                onChange={(e) => handleImageWorkflowSelect(e.target.value)}
                                disabled={generating !== null}
                                className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                              >
                                {availableImageWorkflows.map((wf) => (
                                  <option key={wf.id} value={wf.file}>
                                    {wf.name}
                                  </option>
                                ))}
                              </select>
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <label className="text-xs text-gray-500 block mb-1">宽度</label>
                                  <select
                                    value={imageWorkflowParams.width}
                                    onChange={(e) => setImageWorkflowParams(prev => ({ ...prev, width: Number(e.target.value) }))}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                  >
                                    <option value={512}>512</option>
                                    <option value={768}>768</option>
                                    <option value={1024}>1024</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-xs text-gray-500 block mb-1">高度</label>
                                  <select
                                    value={imageWorkflowParams.height}
                                    onChange={(e) => setImageWorkflowParams(prev => ({ ...prev, height: Number(e.target.value) }))}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                  >
                                    <option value={512}>512</option>
                                    <option value={768}>768</option>
                                    <option value={1024}>1024</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-xs text-gray-500 block mb-1">步数</label>
                                  <select
                                    value={imageWorkflowParams.steps}
                                    onChange={(e) => setImageWorkflowParams(prev => ({ ...prev, steps: Number(e.target.value) }))}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                  >
                                    <option value={8}>8</option>
                                    <option value={16}>16</option>
                                    <option value={20}>20</option>
                                    <option value={30}>30</option>
                                  </select>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full"
                                onClick={handleSaveImageWorkflowParams}
                                disabled={generating !== null}
                              >
                                <Save className="w-3 h-3 mr-1" />
                                保存参数
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 视频生成工作流 */}
                    <div className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Film className="w-4 h-4" />
                          <span className="font-medium text-sm">视频生成工作流</span>
                          {videoWorkflow && (
                            <Badge variant="outline" className="ml-2 bg-green-50 text-green-600 border-green-200 text-xs">
                              已配置
                            </Badge>
                          )}
                        </div>
                        <button
                          className="text-xs text-blue-500 hover:text-blue-700"
                          onClick={() => setShowVideoWorkflowSection(!showVideoWorkflowSection)}
                        >
                          {showVideoWorkflowSection ? "收起" : "展开"}
                        </button>
                      </div>
                      {showVideoWorkflowSection && (
                        <div className="space-y-3">
                          {videoWorkflowLoading ? (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="w-5 h-5 animate-spin text-gray-400 mr-2" />
                              <span className="text-sm text-gray-500">加载中...</span>
                            </div>
                          ) : (
                            <>
                              <select
                                value={videoWorkflow?.templateName || ""}
                                onChange={(e) => handleVideoWorkflowSelect(e.target.value)}
                                disabled={generating !== null}
                                className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                              >
                                <option value="">使用默认配置</option>
                                {availableVideoWorkflows.map((wf) => (
                                  <option key={wf.id} value={wf.file}>
                                    {wf.name}
                                  </option>
                                ))}
                              </select>
                              {videoWorkflow && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="w-full text-red-500"
                                  onClick={handleClearVideoWorkflow}
                                >
                                  清除配置
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
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
                <TabsTrigger value="characters">
                  角色 ({characters.length})
                  {charTemplates.length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs">模板</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="shots">分镜 ({shots.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle>剧本</CardTitle>
                      {/* 分集选择器 */}
                      {project && project.totalEpisodes && project.totalEpisodes > 1 && (
                        <div className="flex items-center gap-1 ml-4">
                          <Layers className="w-4 h-4 text-gray-400" />
                          <select
                            value={activeEpisode}
                            onChange={(e) => setActiveEpisode(Number(e.target.value))}
                            className="text-sm border rounded px-2 py-1 bg-white"
                          >
                            {Array.from({ length: project.totalEpisodes }, (_, i) => (
                              <option key={i + 1} value={i + 1}>第 {i + 1} 集</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {/* 生成单集按钮 */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleGenerateEpisode(activeEpisode)}
                        disabled={generating !== null || !ideaText.trim()}
                      >
                        <Sparkles className="w-4 h-4 mr-1" />
                        生成第{activeEpisode}集
                      </Button>
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
                    </div>
                  </CardHeader>
                  <CardContent>
                    {editingScript ? (
                      <Textarea
                        value={project.scriptText || project.script || ""}
                        onChange={(e) => setProject({ ...project, scriptText: e.target.value })}
                        className="min-h-[300px]"
                        placeholder="输入或粘贴剧本内容..."
                      />
                    ) : (
                      <Textarea
                        value={project.scriptText || project.script || ""}
                        readOnly
                        className="min-h-[300px]"
                        placeholder="输入或粘贴剧本内容..."
                      />
                    )}
                  </CardContent>
                </Card>

                {/* 分集管理 */}
                {project && project.totalEpisodes && project.totalEpisodes > 0 && (
                  <Card className="mt-4">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Layers className="w-4 h-4" />
                        分集管理
                        <Badge variant="outline">{project.totalEpisodes} 集</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {Array.from({ length: project.totalEpisodes }, (_, i) => {
                          const ep = i + 1;
                          return (
                            <Button
                              key={ep}
                              size="sm"
                              variant={activeEpisode === ep ? "default" : "outline"}
                              onClick={() => setActiveEpisode(ep)}
                            >
                              第 {ep} 集
                            </Button>
                          );
                        })}
                        {/* 添加新集按钮 */}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/projects/${projectId}/episodes`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ action: "add" }),
                              });
                              const data = await res.json();
                              if (data.success) {
                                // 更新项目状态
                                setProject({ ...project, totalEpisodes: data.totalEpisodes });
                                // 切换到新集
                                setActiveEpisode(data.totalEpisodes);
                                alert(`已添加第 ${data.totalEpisodes} 集`);
                              } else {
                                alert(data.error || "添加失败");
                              }
                            } catch (error) {
                              console.error("添加新集失败:", error);
                              alert("添加新集失败");
                            }
                          }}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          添加新集
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="characters" className="mt-4">
                {/* 角色描述模板设置入口 */}
                <Card className="mb-4 bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                          <Sparkles className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                          <h3 className="font-medium text-sm">角色描述模板</h3>
                          <p className="text-xs text-gray-500">
                            {charTemplates.length > 0
                              ? `已配置 ${charTemplates.length} 个模板`
                              : "使用默认模板"}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setShowTemplateSettings(true);
                          fetchCharTemplates();
                        }}
                      >
                        <Settings className="w-4 h-4 mr-1" />
                        管理模板
                      </Button>
                    </div>
                  </CardContent>
                </Card>

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
                            placeholder="视觉提示（简短关键词，3-5词）"
                          />
                          <Textarea
                            value={editingChar.description}
                            onChange={(e) => setEditingChar({ ...editingChar, description: e.target.value })}
                            placeholder="角色剧情描述（背景故事、性格特点、在剧情中的作用）"
                            rows={2}
                          />
                          <Textarea
                            value={editingChar.visualDescription}
                            onChange={(e) => setEditingChar({ ...editingChar, visualDescription: e.target.value })}
                            placeholder="角色形象描述（专业外貌描述，用于AI生成角色图片）"
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
                            <div className="relative">
                              {char.referenceImage ? (
                                <>
                                  <img
                                    src={getFileUrl(char.referenceImage) || ""}
                                    alt={char.name}
                                    className="w-24 h-24 object-cover rounded-lg"
                                  />
                                  {/* 操作按钮组 */}
                                  <div className="absolute -bottom-2 -right-2 flex gap-1">
                                    <label className="cursor-pointer">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => handleCharImageUpload(char.id, e)}
                                        disabled={uploadingCharImage === char.id}
                                      />
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        className="h-7 w-7 p-0 rounded-full shadow-md"
                                        disabled={generating !== null || uploadingCharImage === char.id}
                                        title="上传角色图"
                                      >
                                        {uploadingCharImage === char.id ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <UploadCloud className="w-3 h-3 text-blue-500" />
                                        )}
                                      </Button>
                                    </label>
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      className="h-7 w-7 p-0 rounded-full shadow-md"
                                      disabled={generating !== null}
                                      onClick={() => startGenerateWithShot("character_image", char.id, true)}
                                      title="AI重绘"
                                    >
                                      <Loader2 className="w-3 h-3 text-orange-500" />
                                    </Button>
                                  </div>
                                </>
                              ) : (
                                <div className="relative w-24 h-24">
                                  <label className="cursor-pointer w-full h-full">
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(e) => handleCharImageUpload(char.id, e)}
                                      disabled={uploadingCharImage === char.id}
                                    />
                                    <div className={`w-24 h-24 rounded-lg border-2 border-dashed flex flex-col items-center justify-center transition-colors ${
                                      uploadingCharImage === char.id
                                        ? "border-gray-300 bg-gray-50"
                                        : "border-gray-300 hover:border-blue-400 hover:bg-blue-50"
                                    }`}>
                                      {uploadingCharImage === char.id ? (
                                        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                                      ) : (
                                        <>
                                          <UploadCloud className="w-6 h-6 text-gray-400 mb-1" />
                                          <span className="text-xs text-gray-400">上传</span>
                                        </>
                                      )}
                                    </div>
                                  </label>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="absolute -bottom-2 right-0 h-7 text-xs px-2"
                                    disabled={generating !== null}
                                    onClick={() => startGenerateWithShot("character_image", char.id, true)}
                                    title="或使用AI生成"
                                  >
                                    AI生成
                                  </Button>
                                </div>
                              )}
                            </div>
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
                                <p className="text-xs text-blue-500 mt-1 flex items-center gap-1">
                                  <span className="font-medium">视觉:</span> {char.visualHint}
                                </p>
                              )}
                            </div>
                          </div>
                          {/* 剧情描述 */}
                          {char.description && (
                            <div className="mt-2 pt-2 border-t border-gray-100">
                              <p className="text-xs text-gray-500 line-clamp-2">
                                <span className="font-medium text-gray-600">剧情:</span> {char.description}
                              </p>
                            </div>
                          )}
                          {/* 视觉描述 */}
                          {(char as any).visualDescription && (
                            <p className="text-xs text-gray-400 line-clamp-2 mt-1">
                              <span className="font-medium">视觉:</span> {(char as any).visualDescription}
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
                        visualDescription: "",
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
                              onClick={() => startGenerateWithShot("frame_generate", shot.id, true)}
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
                                onClick={() => startGenerateWithShot("frame_generate", shot.id, true)}
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
                                onClick={() => startGenerateWithShot("video_generate", shot.id, true)}
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

      {/* 剧本输入对话框（两种模式） */}
      <Dialog open={showScriptDialog} onOpenChange={setShowScriptDialog}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-500" />
              剧本输入
            </DialogTitle>
            <DialogDescription>
              选择方式输入剧本内容
            </DialogDescription>
          </DialogHeader>
          
          <Tabs value={scriptDialogTab} onValueChange={(v) => setScriptDialogTab(v as "idea" | "paste")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="idea" className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                AI生成剧本
              </TabsTrigger>
              <TabsTrigger value="paste" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                粘贴剧本
              </TabsTrigger>
            </TabsList>

            {/* AI生成剧本选项卡 */}
            <TabsContent value="idea" className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium mb-2 block">创作想法</label>
                <Textarea
                  value={ideaText}
                  onChange={(e) => setIdeaText(e.target.value)}
                  placeholder={`描述你的故事想法...

例如：
- 一个年轻画家在咖啡店遇到了神秘的陌生女子
- 穿越到古代的现代高中生成为宫廷画家
- 机器人艺术家追求创作情感的故事`}
                  rows={8}
                />
                <p className="text-xs text-gray-500 mt-1">
                  请详细描述故事情节、角色设定、场景等，AI会根据你的想法生成完整剧本
                </p>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">风格</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: "anime", label: "日漫", desc: "注重情感、视觉冲击" },
                    { value: "realistic", label: "写实", desc: "真实细腻、注重细节" },
                    { value: "3d", label: "3D", desc: "立体感强、动作流畅" },
                    { value: "cartoon", label: "卡通", desc: "色彩鲜艳、可爱" },
                  ].map((s) => (
                    <Button
                      key={s.value}
                      size="sm"
                      variant={selectedStyle === s.value ? "default" : "outline"}
                      onClick={() => setSelectedStyle(s.value)}
                      title={s.desc}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowScriptDialog(false)}>
                  取消
                </Button>
                <Button onClick={handleScriptDialogIdeaSubmit} disabled={!ideaText.trim()}>
                  <Sparkles className="w-4 h-4 mr-1" />
                  开始生成剧本
                </Button>
              </DialogFooter>
            </TabsContent>

            {/* 粘贴剧本选项卡 */}
            <TabsContent value="paste" className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium mb-2 block">剧本内容</label>
                <Textarea
                  value={scriptInputText}
                  onChange={(e) => setScriptInputText(e.target.value)}
                  placeholder={`在此粘贴或输入剧本内容...

格式示例：
【场景1】咖啡店
角色：小明、小美
对白：
小明：今天的天气真好啊。
小美：是啊，很适合出门。

【场景2】公园
...`}
                  rows={12}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowScriptDialog(false)}>
                  取消
                </Button>
                <Button onClick={handleScriptPasteSubmit} disabled={!scriptInputText.trim()}>
                  <Save className="w-4 h-4 mr-1" />
                  保存剧本
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* 角色描述模板管理对话框 */}
      <Dialog open={showTemplateSettings} onOpenChange={setShowTemplateSettings}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              角色描述模板管理
            </DialogTitle>
            <DialogDescription>
              管理角色描述的生成模板。默认模板不可修改，可以创建新模板进行自定义。
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4">
            {templateLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                <span className="ml-2 text-sm text-gray-500">加载中...</span>
              </div>
            ) : (
              <div className="space-y-3">
                {charTemplates.map((template) => (
                  <Card key={template.id} className={template.isDefault ? "bg-gray-50" : ""}>
                    <CardContent className="pt-4">
                      {editingTemplate?.id === template.id ? (
                        <div className="space-y-3">
                          <Input
                            value={editingTemplate.name}
                            onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                            placeholder="模板名称"
                          />
                          <div>
                            <label className="text-sm font-medium mb-1 block">模板描述</label>
                            <Input
                              value={editingTemplate.description}
                              onChange={(e) => setEditingTemplate({ ...editingTemplate, description: e.target.value })}
                              placeholder="模板描述"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium mb-1 block">System Prompt（角色提取提示词）</label>
                            <Textarea
                              value={editingTemplate.systemPrompt}
                              onChange={(e) => setEditingTemplate({ ...editingTemplate, systemPrompt: e.target.value })}
                              rows={12}
                              className="font-mono text-xs"
                              placeholder="输入 AI 角色描述的系统提示词..."
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={handleSaveTemplate}>
                              保存
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingTemplate(null)}>
                              取消
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium">{template.name}</h3>
                              {template.isDefault && (
                                <Badge variant="secondary" className="text-xs">默认</Badge>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingTemplate({ ...template })}
                                disabled={template.isDefault}
                              >
                                <Edit2 className="w-3 h-3" />
                              </Button>
                              {!template.isDefault && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteTemplate(template.id)}
                                >
                                  <Trash2 className="w-3 h-3 text-red-500" />
                                </Button>
                              )}
                            </div>
                          </div>
                          {template.description && (
                            <p className="text-sm text-gray-500 mt-1">{template.description}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-2 line-clamp-2">
                            {template.systemPrompt?.substring(0, 200)}...
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}

                {charTemplates.length === 0 && !templateLoading && (
                  <div className="text-center py-8 text-gray-500">
                    <Sparkles className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>暂无自定义模板</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateSettings(false)}>
              关闭
            </Button>
            <Button onClick={handleCreateTemplate}>
              <Plus className="w-4 h-4 mr-1" />
              创建新模板
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  // 辅助函数：针对单个分镜生成
  async function startGenerateWithShot(action: string, shotId: string, force = false) {
    setGenerating(action);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, shotId, episode: activeEpisode }),
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
          episode: activeEpisode,
          force,
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
