import type { AIProvider, VideoProvider, ImageOptions, VideoGenerateParams, VideoGenerateResult } from "../types";
import { ulid } from "ulid";
import * as fs from "fs";
import * as path from "path";
import { loadWorkflowTemplate, applyWorkflowParams, type WorkflowParams } from "./workflow-template";

export interface ComfyUIProviderConfig {
  apiUrl?: string;
  workflowName?: string;
  uploadDir?: string;
  defaultWorkflow?: string; // 默认工作流模板文件名
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
 * ComfyUI API 客户端
 */
class ComfyUIAPIClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = normalizeUrl(baseUrl);
  }

  async queuePrompt(prompt: Record<string, unknown>): Promise<{ prompt_id: string }> {
    const nodeCount = Object.keys(prompt).filter(k => !k.startsWith('_')).length;
    console.log(`[ComfyUI API] POST /api/prompt - nodes=${nodeCount}`);
    
    const response = await fetch(`${this.baseUrl}api/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[ComfyUI API] POST /api/prompt failed: status=${response.status}, error=${error}`);
      throw new Error(`ComfyUI API 错误: ${response.status} - ${error}`);
    }

    const result = response.json();
    console.log(`[ComfyUI API] POST /api/prompt success: prompt_id=${(await result).prompt_id}`);
    return result;
  }

  async getHistory(promptId: string): Promise<Record<string, unknown>> {
    console.log(`[ComfyUI API] GET /api/history/${promptId}`);
    const response = await fetch(`${this.baseUrl}api/history/${promptId}`);
    if (!response.ok) {
      console.error(`[ComfyUI API] GET /api/history/${promptId} failed: status=${response.status}`);
      throw new Error(`ComfyUI History API 错误: ${response.status}`);
    }
    return response.json();
  }

  async getQueueStatus(): Promise<{ queue_running: unknown[]; queue_pending: unknown[] }> {
    const response = await fetch(`${this.baseUrl}api/queue`, { method: "GET" });
    if (!response.ok) {
      console.error(`[ComfyUI API] GET /api/queue failed: status=${response.status}`);
      throw new Error(`ComfyUI Queue API 错误: ${response.status}`);
    }
    const result = await response.json();
    console.log(`[ComfyUI API] Queue status: running=${result.queue_running?.length || 0}, pending=${result.queue_pending?.length || 0}`);
    return result;
  }

  async uploadImage(imageData: Buffer, filename: string): Promise<{ name: string }> {
    console.log(`[ComfyUI API] POST /api/upload/image - filename=${filename}, size=${imageData.length} bytes`);
    
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
      console.error(`[ComfyUI API] POST /api/upload/image failed: status=${response.status}, error=${error}`);
      throw new Error(`ComfyUI 上传图片失败: ${response.status} - ${error}`);
    }

    const result = await response.json();
    console.log(`[ComfyUI API] POST /api/upload/image success: name=${result.name}`);
    return result;
  }

  getImageUrl(filename: string, subfolder: string = "", folderType: string = "output"): string {
    const params = new URLSearchParams({ filename, subfolder, folder_type: folderType });
    return `${this.baseUrl}api/view?${params}`;
  }

  async downloadImage(filename: string, subfolder: string = ""): Promise<Buffer> {
    const url = this.getImageUrl(filename, subfolder);
    console.log(`[ComfyUI API] GET /api/view - filename=${filename}, subfolder=${subfolder}`);
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[ComfyUI API] GET /api/view failed: status=${response.status}, filename=${filename}`);
      throw new Error(`下载图片失败: ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    console.log(`[ComfyUI API] Downloaded image: ${filename}, size=${buffer.length} bytes`);
    return buffer;
  }
}

/**
 * ComfyUI 视频生成专用客户端（包含上传目录）
 */
class ComfyUIVideoClient extends ComfyUIAPIClient {
  private uploadDir: string;

  constructor(baseUrl: string, uploadDir: string) {
    super(baseUrl);
    this.uploadDir = uploadDir;
  }

  getUploadDir(): string {
    return this.uploadDir;
  }
}

/**
 * ComfyUI 图片生成 Provider
 * 使用ComfyUI原生REST API进行图像生成
 */
export class ComfyUIImageProvider implements AIProvider {
  private apiUrl: string;
  private uploadDir: string;
  private defaultWorkflow: string;
  private client: ComfyUIAPIClient | null = null;

  constructor(config?: ComfyUIProviderConfig) {
    this.apiUrl = config?.apiUrl || process.env.COMFYUI_API_URL || "";
    this.uploadDir = config?.uploadDir || process.env.UPLOAD_DIR || "./uploads";
    // 默认使用 z_image_turbo 工作流
    this.defaultWorkflow = config?.defaultWorkflow || "image_z_image_turbo.json";
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

  getDefaultWorkflow(): string {
    return this.defaultWorkflow;
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
    console.log(`[ComfyUI Image] Request params:`, {
      prompt: prompt.slice(0, 200) + (prompt.length > 200 ? "..." : ""),
      promptLength: prompt.length,
      size: options?.size || "1024x1024",
      steps: options?.steps || 8,
      hasCustomWorkflow: !!options?.customWorkflow,
      hasReferenceImage: !!options?.referenceImage,
      workflowFile: options?.workflowFile || this.defaultWorkflow,
    });

    const client = this.getClient();
    const width = options?.size ? parseInt(options.size.split('x')[0]) : 1024;
    const height = options?.size ? parseInt(options.size.split('x')[1]) : 1024;
    const steps = options?.steps || 8;

    try {
      // 如果有自定义工作流 JSON，直接使用
      if (options?.customWorkflow) {
        console.log(`[ComfyUI Image] Using custom workflow JSON`);
        return this.generateImageWithWorkflow(prompt, options.customWorkflow, options, onPromptIdSubmit);
      }

      // 加载工作流模板
      const workflowFile = options?.workflowFile || this.defaultWorkflow;
      let templateWorkflow = loadWorkflowTemplate(workflowFile);
      
      if (!templateWorkflow) {
        throw new Error(`Failed to load workflow template: ${workflowFile}`);
      }
      
      // 检测是否是子图格式（包含 definitions.subgraphs）
      const templateDefinitions = templateWorkflow.definitions as Record<string, unknown> | undefined;
      if (templateDefinitions?.subgraphs) {
        console.warn(`[ComfyUI Image] Template ${workflowFile} uses subgraph format, trying API version...`);
        const apiVersion = workflowFile.replace('.json', '_api.json');
        const apiTemplate = loadWorkflowTemplate(apiVersion);
        if (apiTemplate) {
          templateWorkflow = apiTemplate;
          console.log(`[ComfyUI Image] Using API workflow template: ${apiVersion}`);
        } else {
          // 子图格式且没有 API 版本，使用默认的 standard_sd15
          console.warn(`[ComfyUI Image] No API version found, falling back to standard_sd15.json`);
          const fallback = loadWorkflowTemplate('standard_sd15.json');
          if (fallback) {
            templateWorkflow = fallback;
          }
        }
      }
      
      console.log(`[ComfyUI Image] Loaded workflow template: ${workflowFile}`);

      // 构建参数
      const params: WorkflowParams = {
        prompt,
        negative_prompt: options?.quality === "hd" 
          ? "low quality, blurry, deformed, bad anatomy" 
          : "low quality, blurry, deformed, bad anatomy, watermark, text, logo",
        width,
        height,
        steps,
        cfg: options?.cfg ?? 8.0,
        denoise: options?.denoise ?? 1.0,
        seed: options?.seed ?? Math.floor(Math.random() * 1000000000),
        // 模型参数（如果不指定则使用模板默认值）
        model: options?.model,
        vae: options?.vae,
        clip: options?.clip,
        lora: options?.lora,
        lora_strength_model: options?.lora_strength_model ?? 1.0,
        lora_strength_clip: options?.lora_strength_clip ?? 1.0,
      };

      console.log(`[ComfyUI Image] Params for workflow:`, {
        ...params,
        prompt: (params.prompt || '').slice(0, 100) + "...",
        negative_prompt: (params.negative_prompt || '').slice(0, 100) + "...",
        model: params.model || 'template default',
        vae: params.vae || 'template default',
        clip: params.clip || 'template default',
        lora: params.lora || 'template default',
        lora_strength_model: params.lora_strength_model,
        lora_strength_clip: params.lora_strength_clip,
      });

      // 应用参数到工作流
      const workflow = applyWorkflowParams(templateWorkflow, params);
      console.log(`[ComfyUI Image] Workflow prepared, applying params...`);

      // 记录关键节点的输入值，用于调试
      const keyNodes = Object.entries(workflow).filter(([id, node]) => {
        const classType = (node as Record<string, unknown>).class_type as string;
        return ['UNETLoader', 'VAELoader', 'CLIPLoader', 'LoraLoader', 'KSampler'].includes(classType);
      });
      console.log(`[ComfyUI Image] Key nodes inputs:`, 
        keyNodes.map(([id, node]) => ({
          node: id,
          class_type: (node as Record<string, unknown>).class_type,
          inputs: (node as Record<string, unknown>).inputs,
        }))
      );

      // 提交任务
      const startTime = Date.now();
      const { prompt_id } = await client.queuePrompt(workflow);
      console.log(`[ComfyUI Image] Prompt queued, ID: ${prompt_id}, elapsed: ${Date.now() - startTime}ms`);

      // 提交后立即回调，保存 promptId 用于恢复
      if (onPromptIdSubmit) {
        await onPromptIdSubmit(prompt_id);
      }

      // 轮询等待完成
      console.log(`[ComfyUI Image] Waiting for completion...`);
      const result = await this.waitForCompletion(client, prompt_id);
      
      if (result.status === "completed" && result.filePath) {
        console.log(`[ComfyUI Image] Completed:`, {
          filePath: result.filePath,
          totalTime: `${Date.now() - startTime}ms`,
        });
        return result.filePath;
      }

      throw new Error(result.error || "ComfyUI 图片生成失败");
    } catch (error) {
      console.error(`[ComfyUI Image] Failed:`, error);
      throw new Error(`ComfyUI 图片生成失败: ${error instanceof Error ? error.message : "未知错误"}`);
    }
  }

  /**
   * 使用自定义工作流生成图片
   * @param prompt 提示词
   * @param customWorkflow 自定义工作流 JSON
   * @param options 图片选项
   * @param onPromptIdSubmit 提交后回调
   */
  async generateImageWithWorkflow(
    prompt: string,
    customWorkflow: Record<string, unknown>,
    options?: ImageOptions,
    onPromptIdSubmit?: (promptId: string) => void | Promise<void>
  ): Promise<string> {
    console.log(`[ComfyUI Image] Generating image with custom workflow`);

    const client = this.getClient();
    
    // 优先使用 _config 中的配置（从模板加载时设置）
    const config = customWorkflow._config as Record<string, unknown> | undefined;
    const width = config?.width as number || options?.size ? parseInt(options!.size!.split('x')[0]) : 1024;
    const height = config?.height as number || options?.size ? parseInt(options!.size!.split('x')[1]) : 1024;
    const steps = config?.steps as number || options?.steps || 8;
    const cfg = config?.cfg as number || 8.0;
    const model = config?.model as string || '';
    const denoise = config?.denoise as number || 1.0;

    try {
      // 应用工作流并替换占位符
      const workflow = applyWorkflowParams(customWorkflow, {
        prompt,
        negative_prompt: options?.quality === "hd" 
          ? "low quality, blurry, deformed, bad anatomy" 
          : "low quality, blurry, deformed, bad anatomy, watermark, text, logo",
        width,
        height,
        steps,
        cfg,
        seed: Math.floor(Math.random() * 1000000000),
        model,
        denoise,
      });

      // 提交任务
      const { prompt_id } = await client.queuePrompt(workflow);
      console.log(`[ComfyUI Image] Custom workflow prompt submitted, ID: ${prompt_id}`);

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
  private defaultVideoWorkflow: string;
  private client: ComfyUIVideoClient | null = null;

  constructor(config?: ComfyUIProviderConfig) {
    // 优先使用独立的视频 API URL，否则回退到通用 COMFYUI_API_URL
    this.apiUrl = config?.videoApiUrl || process.env.COMFYUI_VIDEO_API_URL || process.env.COMFYUI_API_URL || "";
    this.uploadDir = config?.uploadDir || process.env.UPLOAD_DIR || "./uploads";
    this.defaultVideoWorkflow = config?.videoWorkflowName || "video_wan22_i2v.json";
  }

  private getClient(): ComfyUIVideoClient {
    if (!this.client) {
      this.client = new ComfyUIVideoClient(this.apiUrl, this.uploadDir);
    }
    return this.client;
  }

  /**
   * 生成视频 - 使用ComfyUI API
   * 支持首尾帧插值模式和自定义工作流
   * @param params 视频生成参数
   * @param customWorkflow 可选的自定义工作流 JSON
   */
  async generateVideo(
    params: VideoGenerateParams,
    customWorkflow?: Record<string, unknown>
  ): Promise<VideoGenerateResult> {
    console.log(`[ComfyUI Video] ========== Video Generation Request ==========`);
    console.log(`[ComfyUI Video] Parameters:`, {
      prompt: {
        text: params.prompt.slice(0, 200) + (params.prompt.length > 200 ? "..." : ""),
        length: params.prompt.length,
      },
      ratio: params.ratio,
      duration: params.duration,
      firstFrame: params.firstFrame ? path.basename(params.firstFrame) : null,
      lastFrame: params.lastFrame ? path.basename(params.lastFrame) : null,
      hasCustomWorkflow: !!customWorkflow,
      workflowNodes: customWorkflow ? Object.keys(customWorkflow).length : 0,
    });
    console.log(`[ComfyUI Video] API URL: ${this.apiUrl}`);

    const client = this.getClient();

    try {
      // 解析比例
      let width = 1024, height = 1024;
      if (params.ratio === "16:9") { width = 1280; height = 720; }
      else if (params.ratio === "9:16") { width = 720; height = 1280; }
      else if (params.ratio === "1:1") { width = 1024; height = 1024; }

      console.log(`[ComfyUI Video] Resolution: ${width}x${height}`);

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

      // 创建视频生成工作流：优先使用自定义工作流
      let workflow: Record<string, unknown>;
      if (customWorkflow) {
        workflow = this.applyWorkflowWithParams(customWorkflow, {
          prompt: params.prompt,
          firstFrame: firstFrameFilename,
          lastFrame: lastFrameFilename,
          duration: params.duration || 5,
          width,
          height,
        });
        console.log(`[ComfyUI Video] Using custom workflow (${Object.keys(workflow).length} nodes)`);
      } else {
        // 加载视频工作流模板
        const templateWorkflow = loadWorkflowTemplate(this.defaultVideoWorkflow);
        if (!templateWorkflow) {
          throw new Error(`Failed to load video workflow template: ${this.defaultVideoWorkflow}`);
        }
        
        workflow = this.applyWorkflowWithParams(templateWorkflow, {
          prompt: params.prompt,
          firstFrame: firstFrameFilename,
          lastFrame: lastFrameFilename,
          duration: params.duration || 5,
          width,
          height,
        });
        console.log(`[ComfyUI Video] Using default video workflow: ${this.defaultVideoWorkflow}`);
      }

      // 提交任务
      console.log(`[ComfyUI Video] Submitting prompt to queue...`);
      const { prompt_id } = await client.queuePrompt(workflow);
      console.log(`[ComfyUI Video] Prompt queued, ID: ${prompt_id}`);

      // 轮询等待完成
      const startTime = Date.now();
      console.log(`[ComfyUI Video] Waiting for completion...`);
      const result = await this.waitForVideoCompletion(client, prompt_id);
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[ComfyUI Video] ========== Video Generation Completed ==========`);
      console.log(`[ComfyUI Video] Duration: ${duration}s, File: ${result.filePath}`);
      
      return result;
    } catch (error) {
      console.error(`[ComfyUI Video] ========== Video Generation Failed ==========`);
      console.error(`[ComfyUI Video] Error:`, {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error(`ComfyUI 视频生成失败: ${error instanceof Error ? error.message : "未知错误"}`);
    }
  }

  /**
   * 将参数应用到工作流
   * 支持占位符替换：
   * - {{prompt}} - 正向提示词
   * - {{negative_prompt}} - 负向提示词
   * - {{first_frame}} - 首帧文件名
   * - {{last_frame}} - 尾帧文件名
   * - {{width}} - 宽度
   * - {{height}} - 高度
   * - {{duration}} - 时长
   * - {{frame_length}} - 帧数 (duration * 8)
   */
  private applyWorkflowWithParams(
    workflow: Record<string, unknown>,
    params: {
      prompt: string;
      firstFrame: string | null;
      lastFrame: string | null;
      duration: number;
      width: number;
      height: number;
    }
  ): Record<string, unknown> {
    const frameLength = Math.max(params.duration * 8, 16);
    const defaultNegativePrompt = "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量";

    const result: Record<string, unknown> = {};

    for (const [nodeId, nodeConfig] of Object.entries(workflow)) {
      if (typeof nodeConfig !== "object" || nodeConfig === null) {
        result[nodeId] = nodeConfig;
        continue;
      }

      const config = nodeConfig as Record<string, unknown>;
      const inputs = (config.inputs as Record<string, unknown>) || {};
      const newInputs: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(inputs)) {
        if (typeof value === "string") {
          // 替换占位符
          let newValue = value
            .replace(/\{\{prompt\}\}/g, params.prompt)
            .replace(/\{\{negative_prompt\}\}/g, defaultNegativePrompt)
            .replace(/\{\{first_frame\}\}/g, params.firstFrame || "")
            .replace(/\{\{last_frame\}\}/g, params.lastFrame || "")
            .replace(/\{\{width\}\}/g, String(params.width))
            .replace(/\{\{height\}\}/g, String(params.height))
            .replace(/\{\{duration\}\}/g, String(params.duration))
            .replace(/\{\{frame_length\}\}/g, String(frameLength));
          newInputs[key] = newValue;
        } else if (Array.isArray(value)) {
          // 处理数组值（如节点引用 ["nodeId", 0]）
          newInputs[key] = value.map(v => {
            if (typeof v === "string") {
              return v
                .replace(/\{\{prompt\}\}/g, params.prompt)
                .replace(/\{\{negative_prompt\}\}/g, defaultNegativePrompt)
                .replace(/\{\{first_frame\}\}/g, params.firstFrame || "")
                .replace(/\{\{last_frame\}\}/g, params.lastFrame || "");
            }
            return v;
          });
        } else {
          newInputs[key] = value;
        }
      }

      result[nodeId] = { ...config, inputs: newInputs };
    }

    return result;
  }

  private async waitForVideoCompletion(
    client: ComfyUIVideoClient,
    promptId: string,
    maxRetries: number = 300,
    intervalMs: number = 2000
  ): Promise<VideoGenerateResult> {
    let retryCount = 0;
    const uploadDir = client.getUploadDir();

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
          console.log(`[ComfyUI Video] Task running, retry ${retryCount}/${maxRetries}, elapsed=${((retryCount * intervalMs) / 1000).toFixed(0)}s`);
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
                const dir = path.join(uploadDir, "videos");
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

    throw new Error(`视频生成任务超时 (${(maxRetries * intervalMs / 1000).toFixed(0)}s)`);
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
