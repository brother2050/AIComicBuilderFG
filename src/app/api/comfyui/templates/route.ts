/**
 * ComfyUI 模板列表 API
 * 从 ComfyUI 服务器获取可用的工作流模板列表
 */
import { NextRequest, NextResponse } from "next/server";

interface ComfyUITemplate {
  id: string;
  name: string;
  description: string;
  file: string;
  category?: string;
  thumbnail?: string;
  previewUrl?: string;
}

/**
 * GET /api/comfyui/templates
 * 获取 ComfyUI 服务器上的模板列表
 * 
 * Query params:
 * - type: 'image' | 'video' | 'all' (默认 'all')
 * - baseUrl: 可选的 ComfyUI 服务器地址
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "all";
    const baseUrl = searchParams.get("baseUrl") || process.env.COMFYUI_API_URL;

    if (!baseUrl) {
      return NextResponse.json(
        { error: "ComfyUI API URL not configured" },
        { status: 500 }
      );
    }

    // 尝试从 ComfyUI 服务器获取模板列表
    // ComfyUI 通常在 /templates 目录存储模板
    const templates: ComfyUITemplate[] = [];

    // 方法1: 尝试获取 system_stats 来获取模板信息
    try {
      const statsRes = await fetch(`${baseUrl}/api/system_stats`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(5000),
      });

      if (statsRes.ok) {
        const stats = await statsRes.json();
        // 模板版本信息
        if (stats.system?.installed_templates_version) {
          // 有模板版本说明有模板目录
        }
      }
    } catch (e) {
      // 忽略，获取模板列表失败
    }

    // 方法2: 尝试列出 templates 目录
    try {
      // 尝试获取模板目录内容
      const templatesRes = await fetch(`${baseUrl}/templates`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });

      if (templatesRes.ok) {
        const html = await templatesRes.text();
        // 解析 HTML 中的链接
        const linkRegex = /href="([^"]*\.json)"/g;
        let match;
        while ((match = linkRegex.exec(html)) !== null) {
          const file = match[1];
          const name = file.replace(/\.json$/, "").replace(/[-_]/g, " ");
          templates.push({
            id: file,
            name: formatTemplateName(name),
            description: `ComfyUI 模板: ${name}`,
            file,
            category: guessCategory(name),
          });
        }
      }
    } catch (e) {
      // 忽略，获取模板列表失败
    }

    // 方法3: 尝试获取 object_info 来获取支持的节点类型
    // 这可以帮助我们了解服务器支持哪些类型的生成
    const supportedTypes = await getSupportedNodeTypes(baseUrl);

    // 方法4: 如果上述方法都失败，返回默认模板列表
    if (templates.length === 0) {
      // 返回基于节点类型的动态模板
      const defaultTemplates = generateDefaultTemplates(supportedTypes);
      
      // 根据类型过滤
      return NextResponse.json({
        templates: filterTemplatesByType(defaultTemplates, type),
        supportedTypes,
        source: "generated",
      });
    }

    return NextResponse.json({
      templates: filterTemplatesByType(templates, type),
      supportedTypes,
      source: "server",
    });
  } catch (error) {
    console.error("[API] Failed to get templates:", error);
    return NextResponse.json(
      { error: "Failed to get templates" },
      { status: 500 }
    );
  }
}

/**
 * 获取 ComfyUI 服务器支持的节点类型
 */
async function getSupportedNodeTypes(baseUrl: string): Promise<{
  image: string[];
  video: string[];
  all: string[];
}> {
  const imageTypes = new Set<string>();
  const videoTypes = new Set<string>();
  const allTypes = new Set<string>();

  // 图像生成相关节点
  const imageKeywords = [
    "CLIPTextEncode", "VAEDecode", "VAEEncode", "EmptyLatentImage",
    "KSampler", "UNETLoader", "VAELoader", "CLIPLoader", "SaveImage",
    "LoadImage", "ImageScale", "ImagePad", "ImageCrop", "ImageBlend",
    "ImageUpscaleWithModel", "ControlNetApply", "ControlNetLoader",
    "LoraLoader", "ModelMerge", "ModelSample", "ModelRouting",
    "UNETLoader", "ModelArithmetic"
  ];

  // 视频生成相关节点
  const videoKeywords = [
    "Video", "VideoSave", "VideoCombine", "VideoLoad", "VaeDecodeSequence",
    "FrameInterpolate", "ImageToVideo", "VideoToVideo",
    "LoadImages", "RIFE", "AnimateDiff", "VHS"
  ];

  try {
    const res = await fetch(`${baseUrl}/api/object_info`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const objectInfo = await res.json();
      
      for (const [nodeType, info] of Object.entries(objectInfo)) {
        allTypes.add(nodeType);
        
        // 检查是否是图像相关节点
        const isImage = imageKeywords.some(k => nodeType.includes(k));
        if (isImage) {
          imageTypes.add(nodeType);
        }
        
        // 检查是否是视频相关节点
        const isVideo = videoKeywords.some(k => nodeType.toLowerCase().includes(k.toLowerCase()));
        if (isVideo) {
          videoTypes.add(nodeType);
        }
      }
    }
  } catch (e) {
    // 忽略错误
  }

  return {
    image: Array.from(imageTypes),
    video: Array.from(videoTypes),
    all: Array.from(allTypes),
  };
}

/**
 * 生成默认模板列表
 */
function generateDefaultTemplates(supportedTypes: {
  image: string[];
  video: string[];
  all: string[];
}): ComfyUITemplate[] {
  const templates: ComfyUITemplate[] = [];

  // 图像生成模板
  if (supportedTypes.image.length > 0 || supportedTypes.all.length > 0) {
    // 图生图基础模板
    templates.push({
      id: "image_text_to_image",
      name: "文生图 (Text to Image)",
      description: "根据文本提示生成图像",
      file: "text_to_image.json",
      category: "image",
    });

    templates.push({
      id: "image_image_to_image",
      name: "图生图 (Image to Image)",
      description: "基于输入图像进行生成或编辑",
      file: "image_to_image.json",
      category: "image",
    });

    templates.push({
      id: "image_inpaint",
      name: "局部重绘 (Inpaint)",
      description: "对图像的特定区域进行重绘",
      file: "inpaint.json",
      category: "image",
    });

    templates.push({
      id: "image_upscale",
      name: "图像放大 (Upscale)",
      description: "使用 AI 模型放大图像",
      file: "upscale.json",
      category: "image",
    });
  }

  // 视频生成模板
  if (supportedTypes.video.length > 0 || supportedTypes.all.length > 0) {
    templates.push({
      id: "video_i2v",
      name: "图生视频 (Image to Video)",
      description: "基于首帧图像生成视频",
      file: "image_to_video.json",
      category: "video",
    });

    templates.push({
      id: "video_v2v",
      name: "视频转视频 (Video to Video)",
      description: "基于输入视频进行风格转换",
      file: "video_to_video.json",
      category: "video",
    });

    templates.push({
      id: "video_interpolation",
      name: "视频补帧 (Interpolation)",
      description: "提升视频帧率",
      file: "interpolation.json",
      category: "video",
    });
  }

  // 添加自定义上传选项
  templates.push({
    id: "custom",
    name: "自定义上传",
    description: "从本地 JSON 文件导入工作流",
    file: "",
    category: "custom",
  });

  return templates;
}

/**
 * 根据类型过滤模板
 */
function filterTemplatesByType(
  templates: ComfyUITemplate[],
  type: string
): ComfyUITemplate[] {
  if (type === "all") {
    return templates;
  }
  return templates.filter(t => t.category === type);
}

/**
 * 格式化模板名称
 */
function formatTemplateName(name: string): string {
  // 移除文件扩展名
  let formatted = name.replace(/\.(json|workflow)$/i, "");
  
  // 将连字符和下划线替换为空格
  formatted = formatted.replace(/[-_]+/g, " ");
  
  // 将驼峰命名拆分为单词
  formatted = formatted.replace(/([a-z])([A-Z])/g, "$1 $2");
  
  // 首字母大写
  formatted = formatted
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
  
  return formatted;
}

/**
 * 猜测模板类别
 */
function guessCategory(name: string): string {
  const lowerName = name.toLowerCase();
  
  if (
    lowerName.includes("video") ||
    lowerName.includes("v2v") ||
    lowerName.includes("i2v") ||
    lowerName.includes("interpolation")
  ) {
    return "video";
  }
  
  if (
    lowerName.includes("image") ||
    lowerName.includes("img2img") ||
    lowerName.includes("upscale") ||
    lowerName.includes("inpaint")
  ) {
    return "image";
  }
  
  return "other";
}
