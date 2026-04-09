import type { AIProvider, VideoProvider, ImageOptions, VideoGenerateParams, VideoGenerateResult } from "../types";
import { ulid } from "ulid";
import * as fs from "fs";
import * as path from "path";

export interface ComfyUIProviderConfig {
  apiUrl?: string;
  workflowName?: string;
  uploadDir?: string;
  defaultModel?: string;
  videoWorkflowName?: string;
  videoApiUrl?: string; // 独立的视频生成 API URL
}

type ComfyUITaskStatus = "pending" | "processing" | "completed" | "failed";

interface ComfyUIImageTaskResult {
  taskId: string;
  status: ComfyUITaskStatus;
  filePath?: string;
  error?: string;
}

/**
 * 规范化 URL 确保格式正确
 */
function normalizeUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    normalized = "https://" + normalized;
  }
  return normalized.endsWith("/") ? normalized : normalized + "/";
}

/**
 * 获取图片的 MIME 类型
 */
function getImageMimeType(filePath: string): string {
  const ext = filePath.toLowerCase().split(".").pop();
  switch (ext) {
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    default: return "image/png";
  }
}

/**
 * 从本地文件或 URL 读取图片为 base64
 */
async function readImageAsBase64(imagePath: string): Promise<string> {
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    const res = await fetch(imagePath);
    if (!res.ok) {
      throw new Error(`Failed to fetch image: ${imagePath} (${res.status})`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.toString("base64");
  }
  const data = fs.readFileSync(imagePath);
  return data.toString("base64");
}

/**
 * 创建文本到图像的 ComfyUI 工作流 (Z-Image-Turbo)
 */
function createTextToImageWorkflow(
  prompt: string,
  options?: { width?: number; height?: number; steps?: number; model?: string }
): Record<string, unknown> {
  const width = options?.width || 1024;
  const height = options?.height || 1024;
  const steps = options?.steps || 8;
  const model = options?.model || "z_image_turbo_bf16.safetensors";

  return {
    "3": {
      inputs: { text: prompt, clip: ["30", 0] },
      class_type: "CLIPTextEncode",
      _meta: { title: "Positive Prompt" },
    },
    "4": {
      inputs: { 
        text: "low quality, blurry, deformed, bad anatomy, watermark, text, logo",
        clip: ["30", 0] 
      },
      class_type: "CLIPTextEncode",
      _meta: { title: "Negative Prompt" },
    },
    "5": {
      inputs: { samples: ["6", 0], vae: ["29", 0] },
      class_type: "VAEDecode",
      _meta: { title: "VAE Decode" },
    },
    "6": {
      inputs: {
        model: ["11", 0],
        seed: Math.floor(Math.random() * 1000000000),
        steps: steps,
        cfg: 1.0,
        sampler_name: "euler",
        scheduler: "normal",
        positive: ["3", 0],
        negative: ["4", 0],
        latent_image: ["8", 0],
        denoise: 1.0,
      },
      class_type: "KSampler",
      _meta: { title: "KSampler" },
    },
    "8": {
      inputs: { width, height, batch_size: 1 },
      class_type: "EmptySD3LatentImage",
      _meta: { title: "Empty Latent Image" },
    },
    "11": {
      inputs: { model: ["28", 0], version: 3, shift: 1.0 },
      class_type: "ModelSamplingAuraFlow",
      _meta: { title: "Model Sampling" },
    },
    "28": {
      inputs: { unet_name: model, weight_dtype: "default" },
      class_type: "UNETLoader",
      _meta: { title: "UNet Loader" },
    },
    "29": {
      inputs: { vae_name: "ae.safetensors" },
      class_type: "VAELoader",
      _meta: { title: "VAE Loader" },
    },
    "30": {
      inputs: { clip_name: "qwen_3_4b.safetensors", type: "sd3" },
      class_type: "CLIPLoader",
      _meta: { title: "CLIP Loader" },
    },
    "10": {
      inputs: {
        images: ["5", 0],
        format: "png",
        filename_prefix: "comfyui_gen",
      },
      class_type: "SaveImage",
      _meta: { title: "Save Image" },
    },
  };
}

/**
 * 创建视频生成工作流
 * 基于首尾帧插值生成视频
 */
function createVideoWorkflow(
  prompt: string,
  firstFrameFilename: string | null,
  lastFrameFilename: string | null,
  options?: { duration?: number; width?: number; height?: number }
): Record<string, unknown> {
  const duration = options?.duration || 5;
  const width = options?.width || 1024;
  const height = options?.height || 1024;

  const workflow: Record<string, unknown> = {
    "5": {
      inputs: { text: prompt, clip: ["32", 0] },
      class_type: "CLIPTextEncode",
      _meta: { title: "Positive Prompt" },
    },
    "6": {
      inputs: {
        text: "low quality, blurry, distorted, artifacts",
        clip: ["32", 0]
      },
      class_type: "CLIPTextEncode",
      _meta: { title: "Negative Prompt" },
    },
    "32": {
      inputs: { clip_name: "t5xxl_fp8_e4m3fn.safetensors", type: "sd3" },
      class_type: "CLIPLoader",
      _meta: { title: "CLIP Loader" },
    },
  };

  // 如果有首帧图片，添加LoadImage节点
  if (firstFrameFilename) {
    workflow["11"] = {
      inputs: { image: firstFrameFilename, upload: "workflow" },
      class_type: "LoadImage",
      _meta: { title: "Load First Frame" },
    };
  }

  // 如果有尾帧图片，添加LoadImage节点
  if (lastFrameFilename) {
    workflow["12"] = {
      inputs: { image: lastFrameFilename, upload: "workflow" },
      class_type: "LoadImage",
      _meta: { title: "Load Last Frame" },
    };
  }

  // 根据可用节点创建视频生成采样器
  // 这里需要根据实际的ComfyUI视频生成工作流进行调整
  // 示例使用 AnimateDiff 或类似节点
  workflow["20"] = {
    inputs: {
      model: ["30", 0],
      animatediff_batch_size: 1,
    },
    class_type: "AnimateDiffLoader",
    _meta: { title: "AnimateDiff Loader" },
  };

  workflow["21"] = {
    inputs: {
      sample: ["22", 0],
      previews: false,
    },
    class_type: "VAEDecode_Tiled",
    _meta: { title: "VAE Decode" },
  };

  workflow["22"] = {
    inputs: {
      model: ["20", 0],
      seed: Math.floor(Math.random() * 1000000000),
      steps: 20,
      cfg: 7.0,
      sampler_name: "euler",
      scheduler: "normal",
      positive: ["5", 0],
      negative: ["6", 0],
      latent_image: ["23", 0],
      denoise: 1.0,
    },
    class_type: "KSampler",
    _meta: { title: "Video Sampler" },
  };

  workflow["23"] = {
    inputs: {
      width,
      height,
      length: Math.max(duration * 8, 16), // 每秒约8帧
      batch_size: 1,
    },
    class_type: "EmptyLatentVideo",
    _meta: { title: "Empty Latent Video" },
  };

  workflow["30"] = {
    inputs: { unet_name: "svd_xt.safetensors", weight_dtype: "default" },
    class_type: "UNETLoader",
    _meta: { title: "Video UNet Loader" },
  };

  workflow["24"] = {
    inputs: {
      images: ["21", 0],
      format: "mp4",
      fps: 8,
      filename_prefix: "comfyui_video",
    },
    class_type: "VHS_VideoCombine",
    _meta: { title: "Video Combine" },
  };

  return workflow;
}

/**
 * ComfyUI API 客户端
 */
class ComfyUIAPIClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = normalizeUrl(baseUrl);
  }

  async queuePrompt(prompt: Record<string, unknown>): Promise<{ prompt_id: string }> {
    const response = await fetch(`${this.baseUrl}api/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ComfyUI API 错误: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async getHistory(promptId: string): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}api/history/${promptId}`);
    if (!response.ok) {
      throw new Error(`ComfyUI History API 错误: ${response.status}`);
    }
    return response.json();
  }

  async getQueueStatus(): Promise<{ queue_running: unknown[]; queue_pending: unknown[] }> {
    const response = await fetch(`${this.baseUrl}api/queue`, { method: "GET" });
    if (!response.ok) {
      throw new Error(`ComfyUI Queue API 错误: ${response.status}`);
    }
    return response.json();
  }

  async uploadImage(imageData: Buffer, filename: string): Promise<{ name: string }> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(imageData)]);
    formData.append("image", blob, filename);
    formData.append("subfolder", "input");
    formData.append("type", "input");

    const response = await fetch(`${this.baseUrl}api/upload/image`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ComfyUI 上传图片失败: ${response.status} - ${error}`);
    }

    return response.json();
  }

  getImageUrl(filename: string, subfolder: string = "", folderType: string = "output"): string {
    const params = new URLSearchParams({ filename, subfolder, folder_type: folderType });
    return `${this.baseUrl}api/view?${params}`;
  }

  async downloadImage(filename: string, subfolder: string = ""): Promise<Buffer> {
    const url = this.getImageUrl(filename, subfolder);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`下载图片失败: ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
}

/**
 * ComfyUI 图片生成 Provider
 * 使用ComfyUI原生REST API进行图像生成
 */
export class ComfyUIImageProvider implements AIProvider {
  private apiUrl: string;
  private uploadDir: string;
  private defaultModel: string;
  private client: ComfyUIAPIClient | null = null;

  constructor(config?: ComfyUIProviderConfig) {
    this.apiUrl = config?.apiUrl || process.env.COMFYUI_API_URL || "";
    this.uploadDir = config?.uploadDir || process.env.UPLOAD_DIR || "./uploads";
    this.defaultModel = config?.defaultModel || process.env.COMFYUI_IMAGE_MODEL || "z_image_turbo_bf16.safetensors";
  }

  private getClient(): ComfyUIAPIClient {
    if (!this.client) {
      this.client = new ComfyUIAPIClient(this.apiUrl);
    }
    return this.client;
  }

  getApiUrl(): string {
    return this.apiUrl;
  }

  getUploadDir(): string {
    return this.uploadDir;
  }

  /**
   * 不支持文本生成
   */
  async generateText(_prompt: string, _options?: unknown): Promise<string> {
    throw new Error("ComfyUI Provider 不支持文本生成");
  }

  /**
   * 生成图片 - 使用ComfyUI API
   * @param prompt 提示词
   * @param options 图片选项
   * @param onPromptIdSubmit 提交后回调，用于保存 promptId
   */
  async generateImage(
    prompt: string,
    options?: ImageOptions,
    onPromptIdSubmit?: (promptId: string) => void | Promise<void>
  ): Promise<string> {
    console.log(`[ComfyUI Image] Generating image with prompt: ${prompt.substring(0, 100)}...`);

    const client = this.getClient();
    const width = options?.size ? parseInt(options.size.split('x')[0]) : 1024;
    const height = options?.size ? parseInt(options.size.split('x')[1]) : 1024;
    const steps = 8;

    try {
      // 创建工作流
      const workflow = createTextToImageWorkflow(prompt, { width, height, steps, model: this.defaultModel });

      // 提交任务
      const { prompt_id } = await client.queuePrompt(workflow);
      console.log(`[ComfyUI Image] Prompt submitted, ID: ${prompt_id}`);

      // 提交后立即回调，保存 promptId 用于恢复
      if (onPromptIdSubmit) {
        await onPromptIdSubmit(prompt_id);
      }

      // 轮询等待完成
      const result = await this.waitForCompletion(client, prompt_id);
      
      if (result.status === "completed" && result.filePath) {
        return result.filePath;
      }

      throw new Error(result.error || "ComfyUI 图片生成失败");
    } catch (error) {
      throw new Error(`ComfyUI 图片生成失败: ${error instanceof Error ? error.message : "未知错误"}`);
    }
  }

  private async waitForCompletion(
    client: ComfyUIAPIClient, 
    promptId: string, 
    maxRetries: number = 30,  // 30分钟超时
    intervalMs: number = 60000
  ): Promise<ComfyUIImageTaskResult> {
    let retryCount = 0;

    while (retryCount < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
      retryCount++;

      // 检查队列状态
      const queueStatus = await client.getQueueStatus();
      const isRunning = queueStatus.queue_running.some((p: unknown) => {
        if (Array.isArray(p) && p.length >= 2) {
          const promptData = p[1] as Record<string, unknown>;
          return promptData?.prompt_id === promptId;
        }
        return false;
      });

      if (isRunning) {
        console.log(`[ComfyUI Image] Task running, retry ${retryCount}/${maxRetries}`);
        continue;
      }

      // 任务不在队列中，检查历史
      const result = await this.checkHistoryForImage(client, promptId);
      if (result) {
        return result;
      }
    }

    // 超时后，最后一次尝试：直接从历史记录中查找（图片可能已生成）
    console.log(`[ComfyUI Image] Timeout reached, final attempt to retrieve image...`);
    const finalResult = await this.checkHistoryForImage(client, promptId);
    if (finalResult) {
      return finalResult;
    }

    return { taskId: promptId, status: "failed", error: "任务超时" };
  }

  /**
   * 检查历史记录中是否有生成的图片
   */
  private async checkHistoryForImage(
    client: ComfyUIAPIClient,
    promptId: string
  ): Promise<ComfyUIImageTaskResult | null> {
    try {
      const history = await client.getHistory(promptId);
      const promptHistory = history[promptId] as Record<string, unknown> | undefined;

      if (promptHistory) {
        const outputs = (promptHistory?.outputs || {}) as Record<string, unknown>;

        // 查找输出图片
        for (const nodeId of Object.keys(outputs)) {
          const nodeOutput = outputs[nodeId] as Record<string, unknown>;
          if (nodeOutput?.images) {
            const images = nodeOutput.images as Array<{ filename: string; subfolder?: string }>;
            if (images.length > 0) {
              const imageInfo = images[0];
              const imageBuffer = await client.downloadImage(
                imageInfo.filename, 
                imageInfo.subfolder || ""
              );

              // 保存到本地
              const filename = `${ulid()}.png`;
              const dir = path.join(this.uploadDir, "frames");
              fs.mkdirSync(dir, { recursive: true });
              const filepath = path.join(dir, filename);
              fs.writeFileSync(filepath, imageBuffer);

              console.log(`[ComfyUI Image] Saved to: ${filepath}`);
              return { taskId: promptId, status: "completed", filePath: filepath };
            }
          }
        }

        // 检查是否有错误
        const status = promptHistory?.status as Record<string, unknown> | undefined;
        if (status?.status === "error") {
          return { taskId: promptId, status: "failed", error: "任务执行出错" };
        }
      }
    } catch (e) {
      console.warn(`[ComfyUI Image] History API error: ${e instanceof Error ? e.message : 'unknown'}`);
    }
    return null;
  }
}

/**
 * ComfyUI 视频生成 Provider
 */
export class ComfyUIVideoProvider implements VideoProvider {
  private apiUrl: string;
  private uploadDir: string;
  private videoWorkflowName: string;
  private client: ComfyUIAPIClient | null = null;

  constructor(config?: ComfyUIProviderConfig) {
    // 优先使用独立的视频 API URL，否则回退到通用 COMFYUI_API_URL
    this.apiUrl = config?.videoApiUrl || process.env.COMFYUI_VIDEO_API_URL || process.env.COMFYUI_API_URL || "";
    this.uploadDir = config?.uploadDir || process.env.UPLOAD_DIR || "./uploads";
    this.videoWorkflowName = config?.videoWorkflowName || "video_generation";
  }

  private getClient(): ComfyUIAPIClient {
    if (!this.client) {
      this.client = new ComfyUIAPIClient(this.apiUrl);
    }
    return this.client;
  }

  /**
   * 生成视频 - 使用ComfyUI API
   * 支持首尾帧插值模式
   */
  async generateVideo(params: VideoGenerateParams): Promise<VideoGenerateResult> {
    console.log(`[ComfyUI Video] Generating video...`);

    const client = this.getClient();
    const baseUrl = normalizeUrl(this.apiUrl);

    try {
      // 解析比例
      let width = 1024, height = 1024;
      if (params.ratio === "16:9") { width = 1280; height = 720; }
      else if (params.ratio === "9:16") { width = 720; height = 1280; }
      else if (params.ratio === "1:1") { width = 1024; height = 1024; }

      // 上传首帧和尾帧图片
      let firstFrameFilename: string | null = null;
      let lastFrameFilename: string | null = null;

      if (params.firstFrame) {
        const firstFrameData = await readImageAsBase64(params.firstFrame);
        const firstFrameName = path.basename(params.firstFrame);
        const blob = Buffer.from(firstFrameData, "base64");
        const result = await client.uploadImage(blob, firstFrameName);
        firstFrameFilename = result.name;
        console.log(`[ComfyUI Video] First frame uploaded: ${firstFrameFilename}`);
      }

      if (params.lastFrame) {
        const lastFrameData = await readImageAsBase64(params.lastFrame);
        const lastFrameName = path.basename(params.lastFrame);
        const blob = Buffer.from(lastFrameData, "base64");
        const result = await client.uploadImage(blob, lastFrameName);
        lastFrameFilename = result.name;
        console.log(`[ComfyUI Video] Last frame uploaded: ${lastFrameFilename}`);
      }

      // 创建视频生成工作流
      const workflow = createVideoWorkflow(
        params.prompt,
        firstFrameFilename,
        lastFrameFilename,
        { duration: params.duration || 5, width, height }
      );

      // 提交任务
      const { prompt_id } = await client.queuePrompt(workflow);
      console.log(`[ComfyUI Video] Prompt submitted, ID: ${prompt_id}`);

      // 轮询等待完成
      const result = await this.waitForVideoCompletion(client, prompt_id);
      return result;
    } catch (error) {
      throw new Error(`ComfyUI 视频生成失败: ${error instanceof Error ? error.message : "未知错误"}`);
    }
  }

  private async waitForVideoCompletion(
    client: ComfyUIAPIClient,
    promptId: string,
    maxRetries: number = 300,
    intervalMs: number = 2000
  ): Promise<VideoGenerateResult> {
    let retryCount = 0;

    while (retryCount < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
      retryCount++;

      const queueStatus = await client.getQueueStatus();
      const isRunning = queueStatus.queue_running.some((p: unknown) => {
        if (Array.isArray(p) && p.length >= 2) {
          const promptData = p[1] as Record<string, unknown>;
          return promptData?.prompt_id === promptId;
        }
        return false;
      });

      if (isRunning) {
        if (retryCount % 30 === 0) {
          console.log(`[ComfyUI Video] Task running, retry ${retryCount}/${maxRetries}`);
        }
        continue;
      }

      // 检查历史
      try {
        const history = await client.getHistory(promptId);
        const promptHistory = history[promptId] as Record<string, unknown> | undefined;

        if (promptHistory) {
          const outputs = (promptHistory?.outputs || {}) as Record<string, unknown>;

          // 查找输出视频
          for (const nodeId of Object.keys(outputs)) {
            const nodeOutput = outputs[nodeId] as Record<string, unknown>;
            
            // 检查视频输出 (通常是 VHS_VideoCombine 或类似节点)
            if (nodeOutput?.gifs || nodeOutput?.videos) {
              const videos = (nodeOutput.gifs || nodeOutput.videos) as Array<{ filename: string; subfolder?: string }>;
              if (videos.length > 0) {
                const videoInfo = videos[0];
                const videoUrl = client.getImageUrl(
                  videoInfo.filename,
                  videoInfo.subfolder || "",
                  "temp"
                );

                // 下载视频
                const response = await fetch(videoUrl);
                if (!response.ok) {
                  throw new Error(`下载视频失败: ${response.status}`);
                }

                const buffer = Buffer.from(await response.arrayBuffer());
                const filename = `${ulid()}.mp4`;
                const dir = path.join(this.uploadDir, "videos");
                fs.mkdirSync(dir, { recursive: true });
                const filepath = path.join(dir, filename);
                fs.writeFileSync(filepath, buffer);

                console.log(`[ComfyUI Video] Saved to: ${filepath}`);
                return { filePath: filepath };
              }
            }
          }

          // 检查是否有错误
          const status = promptHistory?.status as Record<string, unknown> | undefined;
          if (status?.status === "error") {
            throw new Error("视频生成任务执行出错");
          }
        }
      } catch (e) {
        console.warn(`[ComfyUI Video] History API error: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }

    throw new Error("视频生成任务超时");
  }
}

// 默认实例
let defaultImageProvider: ComfyUIImageProvider | null = null;
let defaultVideoProvider: ComfyUIVideoProvider | null = null;

export function getComfyUIImageProvider(): ComfyUIImageProvider {
  if (!defaultImageProvider) {
    defaultImageProvider = new ComfyUIImageProvider();
  }
  return defaultImageProvider;
}

export function getComfyUIVideoProvider(): ComfyUIVideoProvider {
  if (!defaultVideoProvider) {
    defaultVideoProvider = new ComfyUIVideoProvider();
  }
  return defaultVideoProvider;
}

/**
 * 通过 promptId 直接从 ComfyUI 获取已生成的图片
 * 用于任务超时后恢复结果。只检查一次，没有就返回 null
 */
export async function fetchComfyUIImageByPromptId(
  promptId: string,
  apiUrl?: string,
  uploadDir?: string
): Promise<string | null> {
  const url = apiUrl || process.env.COMFYUI_API_URL || "";
  const dir = uploadDir || process.env.UPLOAD_DIR || "./uploads";
  
  if (!url) {
    throw new Error("COMFYUI_API_URL 未配置");
  }

  const client = new ComfyUIAPIClient(url);
  
  try {
    // 只检查一次，没有图片就直接返回 null
    const history = await client.getHistory(promptId);
    const promptHistory = history[promptId] as Record<string, unknown> | undefined;

    if (promptHistory) {
      const outputs = (promptHistory?.outputs || {}) as Record<string, unknown>;

      for (const nodeId of Object.keys(outputs)) {
        const nodeOutput = outputs[nodeId] as Record<string, unknown>;
        if (nodeOutput?.images) {
          const images = nodeOutput.images as Array<{ filename: string; subfolder?: string }>;
          if (images.length > 0) {
            const imageInfo = images[0];
            const imageBuffer = await client.downloadImage(
              imageInfo.filename,
              imageInfo.subfolder || ""
            );

            const filename = `${ulid()}.png`;
            const framesDir = path.join(dir, "frames");
            fs.mkdirSync(framesDir, { recursive: true });
            const filepath = path.join(framesDir, filename);
            fs.writeFileSync(filepath, imageBuffer);

            console.log(`[ComfyUI] Retrieved image by promptId, saved to: ${filepath}`);
            return filepath;
          }
        }
      }
    }
    return null;
  } catch (error) {
    console.error(`[ComfyUI] Failed to fetch image by promptId: ${error}`);
    return null;
  }
}
