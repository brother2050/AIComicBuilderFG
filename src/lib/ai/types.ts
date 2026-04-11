// 文本生成选项
export interface TextOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
  images?: string[]; // 用于Vision API的图片路径
  stream?: boolean; // 是否使用流式输出
  onChunk?: (chunk: string) => void; // 流式输出的每个片段回调
}

// 图片生成选项
export interface ImageOptions {
  size?: string; // "1024x1024", "1792x1024", "1024x1792"
  quality?: "standard" | "hd";
  aspectRatio?: string; // "16:9", "9:16", "1:1"
  model?: string; // 模型文件名 (ComfyUI), 如 "z_image_turbo_bf16.safetensors"
  vae?: string; // VAE 文件名 (ComfyUI), 如 "ae.safetensors"
  clip?: string; // CLIP 文件名 (ComfyUI SD3), 如 "qwen_3_4b.safetensors"
  lora?: string; // LoRA 文件名 (ComfyUI), 如 "pixel_art_style_z_image_turbo.safetensors"
  lora_strength_model?: number; // LoRA 对模型的强度 (ComfyUI)
  lora_strength_clip?: number; // LoRA 对 CLIP 的强度 (ComfyUI)
  referenceImage?: string; // 参考图路径
  steps?: number; // 生成步数 (ComfyUI)
  cfg?: number; // CFG 值 (ComfyUI)
  denoise?: number; // 去噪强度 (ComfyUI)
  seed?: number; // 随机种子 (ComfyUI)
  workflowFile?: string; // 工作流模板文件名 (ComfyUI)
  onPromptIdSubmit?: (promptId: string) => void | Promise<void>; // ComfyUI 提交后回调
  customWorkflow?: Record<string, unknown>; // 自定义工作流 JSON
  projectId?: string; // 项目ID，用于分目录存储
  // 图生图支持
  inputImage?: string; // 输入图片路径，用于图生图工作流
  useImageEditApi?: boolean; // 是否使用图生图专用 API（使用 COMFYUI_IMAGE_EDIT_API_URL）
  forcePrompt?: boolean; // 是否强制使用传入的 prompt 覆盖工作流中的默认文本
  // 进度回调 (ComfyUI)
  onProgress?: (progress: number) => void; // 进度百分比 0-100
  onNodeExecuting?: (nodeId: string | null) => void; // 当前执行节点
  onComplete?: () => void; // 完成回调
}

// 视频生成参数
export interface VideoGenerateParams {
  prompt: string;
  firstFrame?: string; // 首帧图片路径
  lastFrame?: string; // 尾帧图片路径
  initialImage?: string; // 参考图
  duration?: number; // 时长（秒）
  ratio?: string; // 比例 "16:9", "9:16", "1:1"
  projectId?: string; // 项目ID，用于分目录存储
}

// 视频生成结果
export interface VideoGenerateResult {
  filePath: string;
  lastFrameUrl?: string;
  metadata?: {
    fileSize?: number;
    duration?: number;
    width?: number;
    height?: number;
  };
}

// AIProvider 接口 - 文本+图片生成
export interface AIProvider {
  generateText(prompt: string, options?: TextOptions): Promise<string>;
  generateImage(
    prompt: string, 
    options?: ImageOptions,
    onPromptIdSubmit?: (promptId: string) => void | Promise<void>
  ): Promise<string>;
  generateImageWithWorkflow?(
    prompt: string,
    customWorkflow: Record<string, unknown>,
    options?: ImageOptions,
    onPromptIdSubmit?: (promptId: string) => void | Promise<void>
  ): Promise<string>;
}

// VideoProvider 接口 - 视频生成
export interface VideoProvider {
  generateVideo(params: VideoGenerateParams): Promise<VideoGenerateResult>;
}
