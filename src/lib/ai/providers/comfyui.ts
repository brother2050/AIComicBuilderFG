/**
 * ComfyUI 图片/视频生成 Provider
 */
import type { AIProvider, VideoProvider, ImageOptions, VideoGenerateParams, VideoGenerateResult } from "../types";
import { ulid } from "ulid";
import * as fs from "fs";
import * as path from "path";
import { loadWorkflowTemplate, applyWorkflowParams, loadProjectWorkflow, type WorkflowParams } from "./workflow-template";
import { getProjectFramesDir, getProjectVideosDir } from "@/lib/fs";

// ============ 类型定义 ============

export interface ComfyUIConfig {
  apiUrl?: string;
  defaultWorkflow?: string;
  videoWorkflow?: string;
  videoApiUrl?: string;
  uploadDir?: string;
}

type TaskStatus = "pending" | "processing" | "completed" | "failed";

interface TaskResult {
  taskId: string;
  status: TaskStatus;
  filePath?: string;
  error?: string;
}

export interface ProgressCallback {
  onProgress?: (value: number) => void;
  onNodeExecuting?: (nodeId: string | null) => void;
  onComplete?: () => void;
}

// ============ 异步任务接口 ============

export interface ImageSubmitResult {
  promptId: string;
}

export interface ImageStatusResult {
  status: "pending" | "processing" | "completed" | "failed";
  filePath?: string;
  error?: string;
}

// ============ 工具函数 ============

function normalizeUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    normalized = "https://" + normalized;
  }
  return normalized.endsWith("/") ? normalized : normalized + "/";
}

function generateClientId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

async function readImageAsBase64(imagePath: string): Promise<string> {
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    const res = await fetch(imagePath);
    if (!res.ok) throw new Error(`Failed to fetch: ${imagePath}`);
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  }
  return fs.readFileSync(imagePath).toString("base64");
}

// ============ API 客户端 ============

class ComfyUIAPIClient {
  constructor(private baseUrl: string) {
    this.baseUrl = normalizeUrl(baseUrl);
  }

  async queuePrompt(prompt: Record<string, unknown>): Promise<{ prompt_id: string }> {
    const response = await fetch(`${this.baseUrl}api/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!response.ok) throw new Error(`Queue failed: ${response.status}`);
    return response.json();
  }

  async getHistory(promptId: string): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}api/history/${promptId}`);
    if (!response.ok) throw new Error(`History failed: ${response.status}`);
    return response.json();
  }

  async getQueueStatus(): Promise<{ queue_running: unknown[]; queue_pending: unknown[] }> {
    const response = await fetch(`${this.baseUrl}api/queue`);
    if (!response.ok) throw new Error(`Queue status failed: ${response.status}`);
    return response.json();
  }

  async uploadImage(imageData: Buffer, filename: string): Promise<{ name: string }> {
    const formData = new FormData();
    formData.append("image", new Blob([new Uint8Array(imageData)]), filename);
    formData.append("subfolder", "input");

    const response = await fetch(`${this.baseUrl}api/upload/image`, { method: "POST", body: formData });
    if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
    return response.json();
  }

  async downloadImage(filename: string, subfolder: string = ""): Promise<Buffer> {
    const params = new URLSearchParams({ filename, subfolder, folder_type: "output" });
    const response = await fetch(`${this.baseUrl}api/view?${params}`);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  getImageUrl(filename: string, subfolder: string = "", folderType = "output"): string {
    const params = new URLSearchParams({ filename, subfolder, folder_type: folderType });
    return `${this.baseUrl}api/view?${params}`;
  }
}

// ============ 图片生成 Provider ============

export class ComfyUIImageProvider implements AIProvider {
  private client: ComfyUIAPIClient;

  constructor(
    private apiUrl = process.env.COMFYUI_API_URL || "",
    private uploadDir = process.env.UPLOAD_DIR || "./uploads",
    private defaultWorkflow = "image_z_image_turbo.json"
  ) {
    this.client = new ComfyUIAPIClient(this.apiUrl);
  }

  async generateText(_prompt: string): Promise<string> {
    throw new Error("ComfyUI 不支持文本生成");
  }

  async generateImage(
    prompt: string,
    options?: ImageOptions,
    onPromptIdSubmit?: (id: string) => void | Promise<void>
  ): Promise<string> {
    // 加载工作流
    let workflow = options?.customWorkflow || loadProjectWorkflow(options?.workflowFile ? JSON.stringify({ _workflowFile: options.workflowFile }) : null);
    if (!workflow) {
      workflow = loadWorkflowTemplate(this.defaultWorkflow);
    }
    if (!workflow) {
      throw new Error(`Failed to load workflow: ${this.defaultWorkflow}`);
    }

    // 构建参数
    const params: WorkflowParams = {
      prompt,
      negative_prompt: options?.quality === "hd" ? "low quality, blurry, deformed" : "low quality, blurry, watermark, text",
      width: options?.size ? parseInt(options.size.split('x')[0]) : 1024,
      height: options?.size ? parseInt(options.size.split('x')[1]) : 1024,
      steps: options?.steps || 8,
      cfg: options?.cfg ?? 8.0,
      denoise: options?.denoise ?? 1.0,
      seed: options?.seed ?? Math.floor(Math.random() * 1e9),
      model: options?.model,
      vae: options?.vae,
      clip: options?.clip,
    };

    const apiWorkflow = applyWorkflowParams(workflow, params);
    const { prompt_id } = await this.client.queuePrompt(apiWorkflow);

    if (onPromptIdSubmit) await onPromptIdSubmit(prompt_id);

    const result = await this.waitForCompletion(prompt_id, options);
    if (result.status === "completed" && result.filePath) {
      return result.filePath;
    }
    throw new Error(result.error || "Image generation failed");
  }

  async generateImageWithWorkflow(
    prompt: string,
    workflow: Record<string, unknown>,
    options?: ImageOptions,
    onPromptIdSubmit?: (id: string) => void | Promise<void>
  ): Promise<string> {
    const config = workflow._config as Record<string, unknown> | undefined;
    const params: WorkflowParams = {
      prompt,
      negative_prompt: options?.quality === "hd" ? "low quality, blurry, deformed" : "low quality, blurry, watermark, text",
      width: config?.width as number || (options?.size ? parseInt(options.size.split('x')[0]) : 1024),
      height: config?.height as number || (options?.size ? parseInt(options.size.split('x')[1]) : 1024),
      steps: config?.steps as number || options?.steps || 8,
      seed: Math.floor(Math.random() * 1e9),
      model: config?.model as string || '',
    };

    const apiWorkflow = applyWorkflowParams(workflow, params);
    const { prompt_id } = await this.client.queuePrompt(apiWorkflow);

    if (onPromptIdSubmit) await onPromptIdSubmit(prompt_id);

    const result = await this.waitForCompletion(prompt_id, options);
    if (result.status === "completed" && result.filePath) {
      return result.filePath;
    }
    throw new Error(result.error || "Image generation failed");
  }

  // ============ 异步模式方法 ============

  /**
   * 异步提交图片生成任务（不等待完成）
   */
  async submitImage(
    prompt: string,
    options?: ImageOptions
  ): Promise<ImageSubmitResult> {
    let workflow = options?.customWorkflow || loadProjectWorkflow(options?.workflowFile ? JSON.stringify({ _workflowFile: options.workflowFile }) : null);
    if (!workflow) {
      workflow = loadWorkflowTemplate(this.defaultWorkflow);
    }
    if (!workflow) {
      throw new Error(`Failed to load workflow: ${this.defaultWorkflow}`);
    }

    const params: WorkflowParams = {
      prompt,
      negative_prompt: options?.quality === "hd" ? "low quality, blurry, deformed" : "low quality, blurry, watermark, text",
      width: options?.size ? parseInt(options.size.split('x')[0]) : 1024,
      height: options?.size ? parseInt(options.size.split('x')[1]) : 1024,
      steps: options?.steps || 8,
      cfg: options?.cfg ?? 8.0,
      denoise: options?.denoise ?? 1.0,
      seed: options?.seed ?? Math.floor(Math.random() * 1e9),
      model: options?.model,
      vae: options?.vae,
      clip: options?.clip,
    };

    const apiWorkflow = applyWorkflowParams(workflow, params);
    const { prompt_id } = await this.client.queuePrompt(apiWorkflow);
    return { promptId: prompt_id };
  }

  /**
   * 异步检查图片任务状态
   */
  async checkImageStatus(
    promptId: string,
    options?: ImageOptions
  ): Promise<ImageStatusResult> {
    try {
      const queue = await this.client.getQueueStatus();
      const isRunning = queue.queue_running.some((p: unknown) =>
        Array.isArray(p) && (p[1] as Record<string, unknown>)?.prompt_id === promptId
      );
      const isPending = queue.queue_pending.some((p: unknown) =>
        Array.isArray(p) && (p[1] as Record<string, unknown>)?.prompt_id === promptId
      );

      if (isRunning) {
        console.log(`[ComfyUI] Prompt ${promptId} is running`);
        return { status: "processing" };
      }
      if (isPending) {
        console.log(`[ComfyUI] Prompt ${promptId} is pending`);
        return { status: "processing" };
      }

      // 任务不在队列中，尝试从 history 获取结果
      console.log(`[ComfyUI] Prompt ${promptId} not in queue, checking history...`);
      const result = await this.getImageResult(promptId, options);
      if (result?.status === "completed" && result.filePath) {
        return { status: "completed", filePath: result.filePath };
      }

      // 如果 history 为空，说明任务刚提交还没开始执行，或者还在处理中
      // 返回 processing 让调用方继续轮询
      console.log(`[ComfyUI] Prompt ${promptId} not completed yet, continuing...`);
      return { status: "processing" };
    } catch (e) {
      console.error(`[ComfyUI] Check status error for ${promptId}:`, e);
      return { status: "processing" };
    }
  }

  /**
   * 异步轮询直到图片生成完成
   */
  async pollImageUntilComplete(
    promptId: string,
    options?: ImageOptions & {
      onProgress?: (value: number) => void;
      checkCancelled?: () => Promise<boolean>; // 检查是否取消
    },
    maxRetries = 120
  ): Promise<string> {
    for (let i = 0; i < maxRetries; i++) {
      // 检查是否被取消
      if (options?.checkCancelled) {
        const cancelled = await options.checkCancelled();
        if (cancelled) {
          console.log(`[ComfyUI] Polling cancelled for promptId: ${promptId}`);
          throw new Error("Task cancelled");
        }
      }

      const status = await this.checkImageStatus(promptId, options);

      if (status.status === "completed" && status.filePath) {
        return status.filePath;
      }

      if (status.status === "failed") {
        throw new Error(status.error || "Image generation failed");
      }

      options?.onProgress?.(Math.min((i / maxRetries) * 100, 95));
      await new Promise(r => setTimeout(r, 15000));
    }
    throw new Error("Image generation timeout");
  }

  private async waitForCompletion(promptId: string, options?: ImageOptions & ProgressCallback): Promise<TaskResult> {
    // 尝试 WebSocket
    if (typeof window !== 'undefined' || process.env.COMFYUI_WEBSOCKET_ENABLED === 'true') {
      try {
        return await this.waitWithWebSocket(promptId, options);
      } catch (e) {
        console.warn(`[ComfyUI] WebSocket failed, using polling: ${e}`);
      }
    }
    return this.pollCompletion(promptId, options);
  }

  private async waitWithWebSocket(promptId: string, options?: ImageOptions & ProgressCallback): Promise<TaskResult> {
    return new Promise((resolve, reject) => {
      const clientId = generateClientId();
      const wsHost = this.apiUrl.replace(/^https?:\/\//, '');
      const ws = new WebSocket(`ws://${wsHost}/ws?clientId=${clientId}`);
      let isResolved = false;

      const cleanup = () => { ws.close(); };
      const resolveResult = (r: TaskResult) => { if (!isResolved) { isResolved = true; cleanup(); options?.onComplete?.(); resolve(r); } };
      const rejectResult = (e: Error) => { if (!isResolved) { isResolved = true; cleanup(); reject(e); } };

      ws.onopen = () => console.log(`[ComfyUI WS] Connected`);
      ws.onerror = () => rejectResult(new Error('WebSocket error'));
      ws.onclose = () => {
        if (!isResolved) this.pollCompletion(promptId, options).then(resolveResult).catch(rejectResult);
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          const data = msg.data || {};

          switch (msg.type) {
            case 'executing':
              options?.onNodeExecuting?.(data.node);
              if (data.node === null) console.log(`[ComfyUI] Started`);
              break;
            case 'progress':
              const progress = data.max > 0 ? (data.value / data.max) * 100 : 0;
              options?.onProgress?.(progress);
              break;
            case 'execution_success':
              options?.onProgress?.(100);
              const result = await this.getImageResult(promptId, options);
              resolveResult(result || { taskId: promptId, status: "failed", error: "No result found" });
              break;
            case 'execution_error':
              resolveResult({ taskId: promptId, status: "failed", error: String(data.exception_message || 'Error') });
              break;
          }
        } catch (e) {
          console.error(`[ComfyUI WS] Parse error:`, e);
        }
      };

      setTimeout(() => {
        if (!isResolved) {
          console.log(`[ComfyUI] WebSocket timeout, switching to polling`);
          cleanup();
          this.pollCompletion(promptId, options).then(resolveResult).catch(rejectResult);
        }
      }, 60000);
    });
  }

  private async pollCompletion(promptId: string, options?: ProgressCallback, maxRetries = 120): Promise<TaskResult> {
    console.log(`[ComfyUI] Starting poll for promptId: ${promptId}, maxRetries: ${maxRetries}`);
    for (let i = 0; i < maxRetries; i++) {
      await new Promise(r => setTimeout(r, 15000));

      const queue = await this.client.getQueueStatus();
      const isRunning = queue.queue_running.some((p: unknown) =>
        Array.isArray(p) && (p[1] as Record<string, unknown>)?.prompt_id === promptId
      );

      if (!isRunning) {
        console.log(`[ComfyUI] Prompt ${promptId} not in running queue, checking history...`);
        options?.onProgress?.(100);
        const result = await this.getImageResult(promptId, options);
        return result || { taskId: promptId, status: "failed", error: "Timeout" };
      }
      options?.onProgress?.(Math.min((i / maxRetries) * 80, 80));
    }
    return { taskId: promptId, status: "failed", error: "Timeout" };
  }

  private async getImageResult(promptId: string, options?: ImageOptions): Promise<TaskResult | null> {
    try {
      const history = await this.client.getHistory(promptId);
      console.log(`[ComfyUI] History for ${promptId}:`, JSON.stringify(history).slice(0, 500));
      const outputs = (history[promptId] as Record<string, unknown>)?.outputs as Record<string, unknown> | undefined;

      if (!outputs || Object.keys(outputs).length === 0) {
        console.log(`[ComfyUI] No outputs found for promptId: ${promptId}`);
        return null;
      }

      for (const nodeId of Object.keys(outputs || {})) {
        const output = outputs![nodeId] as Record<string, unknown>;
        if (output?.images) {
          const images = output.images as Array<{ filename: string; subfolder?: string }>;
          const buffer = await this.client.downloadImage(images[0].filename, images[0].subfolder || "");

          const filename = `${ulid()}.png`;
          const dir = options?.projectId ? getProjectFramesDir(options.projectId) : path.join(this.uploadDir, "frames");
          fs.mkdirSync(dir, { recursive: true });
          const filepath = path.join(dir, filename);
          fs.writeFileSync(filepath, buffer);

          return { taskId: promptId, status: "completed", filePath: filepath };
        }
      }
    } catch (e) {
      console.warn(`[ComfyUI] History error: ${e}`);
    }
    return null;
  }
}

// ============ 视频生成 Provider ============

export class ComfyUIVideoProvider implements VideoProvider {
  private client: ComfyUIAPIClient;

  constructor(
    private apiUrl = process.env.COMFYUI_VIDEO_API_URL || process.env.COMFYUI_API_URL || "",
    private uploadDir = process.env.UPLOAD_DIR || "./uploads",
    private defaultWorkflow = "video_wan2_2_14B_i2v.json"
  ) {
    this.client = new ComfyUIAPIClient(this.apiUrl);
  }

  async generateVideo(params: VideoGenerateParams): Promise<VideoGenerateResult> {
    // 解析分辨率
    let width = 1024, height = 1024;
    if (params.ratio === "16:9") { width = 1280; height = 720; }
    else if (params.ratio === "9:16") { width = 720; height = 1280; }

    // 上传首尾帧
    let firstFrameFile: string | null = null;
    let lastFrameFile: string | null = null;

    if (params.firstFrame) {
      const data = await readImageAsBase64(params.firstFrame);
      firstFrameFile = (await this.client.uploadImage(Buffer.from(data, "base64"), path.basename(params.firstFrame))).name;
    }
    if (params.lastFrame) {
      const data = await readImageAsBase64(params.lastFrame);
      lastFrameFile = (await this.client.uploadImage(Buffer.from(data, "base64"), path.basename(params.lastFrame))).name;
    }

    // 加载工作流
    const workflow = loadWorkflowTemplate(this.defaultWorkflow);
    if (!workflow) throw new Error(`Failed to load: ${this.defaultWorkflow}`);

    const frameLength = Math.max((params.duration || 5) * 8, 16);
    const negPrompt = "色调艳丽，过曝，静态，细节模糊";

    // 应用参数
    const apiWorkflow = applyWorkflowParams(workflow, {
      prompt: params.prompt,
      negative_prompt: negPrompt,
      first_frame: firstFrameFile || undefined,
      last_frame: lastFrameFile || undefined,
      width,
      height,
      frame_length: frameLength,
    });

    const { prompt_id } = await this.client.queuePrompt(apiWorkflow);
    const filepath = await this.waitForVideo(prompt_id, params);

    return { filePath: filepath };
  }

  // ============ 异步模式方法 ============

  /**
   * 异步提交视频生成任务（不等待完成）
   */
  async submitVideo(params: VideoGenerateParams): Promise<{ promptId: string }> {
    let width = 1024, height = 1024;
    if (params.ratio === "16:9") { width = 1280; height = 720; }
    else if (params.ratio === "9:16") { width = 720; height = 1280; }

    let firstFrameFile: string | null = null;
    let lastFrameFile: string | null = null;

    if (params.firstFrame) {
      const data = await readImageAsBase64(params.firstFrame);
      firstFrameFile = (await this.client.uploadImage(Buffer.from(data, "base64"), path.basename(params.firstFrame))).name;
    }
    if (params.lastFrame) {
      const data = await readImageAsBase64(params.lastFrame);
      lastFrameFile = (await this.client.uploadImage(Buffer.from(data, "base64"), path.basename(params.lastFrame))).name;
    }

    const workflow = loadWorkflowTemplate(this.defaultWorkflow);
    if (!workflow) throw new Error(`Failed to load: ${this.defaultWorkflow}`);

    const frameLength = Math.max((params.duration || 5) * 8, 16);
    const negPrompt = "色调艳丽，过曝，静态，细节模糊";

    const apiWorkflow = applyWorkflowParams(workflow, {
      prompt: params.prompt,
      negative_prompt: negPrompt,
      first_frame: firstFrameFile || undefined,
      last_frame: lastFrameFile || undefined,
      width,
      height,
      frame_length: frameLength,
    });

    const { prompt_id } = await this.client.queuePrompt(apiWorkflow);
    return { promptId: prompt_id };
  }

  /**
   * 异步检查视频任务状态
   */
  async checkVideoStatus(promptId: string): Promise<{ status: "pending" | "processing" | "completed" | "failed"; filePath?: string; error?: string }> {
    try {
      const queue = await this.client.getQueueStatus();
      const isRunning = queue.queue_running.some((p: unknown) =>
        Array.isArray(p) && (p[1] as Record<string, unknown>)?.prompt_id === promptId
      );
      const isPending = queue.queue_pending.some((p: unknown) =>
        Array.isArray(p) && (p[1] as Record<string, unknown>)?.prompt_id === promptId
      );

      if (isRunning || isPending) {
        return { status: "processing" };
      }

      const history = await this.client.getHistory(promptId);
      const outputs = (history[promptId] as Record<string, unknown>)?.outputs as Record<string, unknown> | undefined;

      for (const nodeId of Object.keys(outputs || {})) {
        const output = outputs![nodeId] as Record<string, unknown>;
        if (output?.videos || output?.gifs) {
          return { status: "completed" };
        }
      }
      return { status: "failed", error: "No video output found" };
    } catch (e) {
      return { status: "failed", error: String(e) };
    }
  }

  /**
   * 异步轮询直到视频生成完成并下载
   */
  async pollVideoUntilComplete(
    promptId: string,
    params: VideoGenerateParams,
    options?: {
      onProgress?: (value: number) => void;
      checkCancelled?: () => Promise<boolean>;
    },
    maxRetries = 600
  ): Promise<string> {
    for (let i = 0; i < maxRetries; i++) {
      // 检查是否被取消
      if (options?.checkCancelled) {
        const cancelled = await options.checkCancelled();
        if (cancelled) {
          console.log(`[ComfyUI] Video polling cancelled for promptId: ${promptId}`);
          throw new Error("Task cancelled");
        }
      }

      const status = await this.checkVideoStatus(promptId);

      if (status.status === "completed") {
        // 下载视频
        const history = await this.client.getHistory(promptId);
        const outputs = (history[promptId] as Record<string, unknown>)?.outputs as Record<string, unknown>;

        for (const nodeId of Object.keys(outputs || {})) {
          const output = outputs![nodeId] as Record<string, unknown>;
          if (output?.videos || output?.gifs) {
            const videos = (output.videos || output.gifs) as Array<{ filename: string; subfolder?: string }>;
            const url = this.client.getImageUrl(videos[0].filename, videos[0].subfolder || "", "temp");

            const buffer = Buffer.from(await (await fetch(url)).arrayBuffer());
            const filename = `${ulid()}.mp4`;
            const dir = params.projectId ? getProjectVideosDir(params.projectId) : path.join(this.uploadDir, "videos");
            fs.mkdirSync(dir, { recursive: true });
            const filepath = path.join(dir, filename);
            fs.writeFileSync(filepath, buffer);
            return filepath;
          }
        }
      }

      if (status.status === "failed") {
        throw new Error(status.error || "Video generation failed");
      }

      options?.onProgress?.(Math.min((i / maxRetries) * 100, 95));
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error("Video generation timeout");
  }

  private async waitForVideo(promptId: string, params: VideoGenerateParams, maxRetries = 300): Promise<string> {
    for (let i = 0; i < maxRetries; i++) {
      await new Promise(r => setTimeout(r, 2000));

      const queue = await this.client.getQueueStatus();
      const isRunning = queue.queue_running.some((p: unknown) =>
        Array.isArray(p) && (p[1] as Record<string, unknown>)?.prompt_id === promptId
      );

      if (!isRunning) {
        const history = await this.client.getHistory(promptId);
        const outputs = (history[promptId] as Record<string, unknown>)?.outputs as Record<string, unknown>;

        for (const nodeId of Object.keys(outputs || {})) {
          const output = outputs![nodeId] as Record<string, unknown>;
          if (output?.videos || output?.gifs) {
            const videos = (output.videos || output.gifs) as Array<{ filename: string; subfolder?: string }>;
            const url = this.client.getImageUrl(videos[0].filename, videos[0].subfolder || "", "temp");

            const buffer = Buffer.from(await (await fetch(url)).arrayBuffer());
            const filename = `${ulid()}.mp4`;
            const dir = params.projectId ? getProjectVideosDir(params.projectId) : path.join(this.uploadDir, "videos");
            fs.mkdirSync(dir, { recursive: true });
            const filepath = path.join(dir, filename);
            fs.writeFileSync(filepath, buffer);
            return filepath;
          }
        }
      }
    }
    throw new Error("Video generation timeout");
  }
}

// ============ 导出默认实例 ============

let imageProvider: ComfyUIImageProvider | null = null;
let videoProvider: ComfyUIVideoProvider | null = null;

export function getComfyUIImageProvider(): ComfyUIImageProvider {
  return imageProvider || (imageProvider = new ComfyUIImageProvider());
}

export function getComfyUIVideoProvider(): ComfyUIVideoProvider {
  return videoProvider || (videoProvider = new ComfyUIVideoProvider());
}

/**
 * 通过 promptId 恢复图片
 */
export async function recoverImageByPromptId(
  promptId: string,
  apiUrl?: string,
  uploadDir?: string
): Promise<string | null> {
  const url = apiUrl || process.env.COMFYUI_API_URL || "";
  const dir = uploadDir || process.env.UPLOAD_DIR || "./uploads";

  const client = new ComfyUIAPIClient(url);
  try {
    const history = await client.getHistory(promptId);
    const outputs = (history[promptId] as Record<string, unknown>)?.outputs as Record<string, unknown>;

    for (const nodeId of Object.keys(outputs || {})) {
      const output = outputs![nodeId] as Record<string, unknown>;
      if (output?.images) {
        const images = output.images as Array<{ filename: string; subfolder?: string }>;
        const buffer = await client.downloadImage(images[0].filename, images[0].subfolder || "");

        const filename = `${ulid()}.png`;
        const framesDir = path.join(dir, "frames");
        fs.mkdirSync(framesDir, { recursive: true });
        const filepath = path.join(framesDir, filename);
        fs.writeFileSync(filepath, buffer);
        return filepath;
      }
    }
  } catch (e) {
    console.error(`[ComfyUI] Recover failed: ${e}`);
  }
  return null;
}
