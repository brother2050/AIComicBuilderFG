// AI供应商配置
export interface ProviderConfig {
  protocol: "openai" | "comfyui";
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

// 文本生成选项
export interface TextOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
  images?: string[]; // 用于Vision API的图片路径
}

// 图片生成选项
export interface ImageOptions {
  size?: string; // "1024x1024", "1792x1024", "1024x1792"
  quality?: "standard" | "hd";
  aspectRatio?: string; // "16:9", "9:16", "1:1"
  model?: string;
  onPromptIdSubmit?: (promptId: string) => void | Promise<void>; // ComfyUI 提交后回调
}

// 视频生成参数
export interface VideoGenerateParams {
  prompt: string;
  firstFrame?: string; // 首帧图片路径
  lastFrame?: string; // 尾帧图片路径
  initialImage?: string; // 参考图
  duration?: number; // 时长（秒）
  ratio?: string; // 比例 "16:9", "9:16", "1:1"
}

// 视频生成结果
export interface VideoGenerateResult {
  filePath: string;
  lastFrameUrl?: string;
}

// AIProvider 接口 - 文本+图片生成
export interface AIProvider {
  generateText(prompt: string, options?: TextOptions): Promise<string>;
  generateImage(
    prompt: string, 
    options?: ImageOptions,
    onPromptIdSubmit?: (promptId: string) => void | Promise<void>
  ): Promise<string>;
}

// VideoProvider 接口 - 视频生成
export interface VideoProvider {
  generateVideo(params: VideoGenerateParams): Promise<VideoGenerateResult>;
}
