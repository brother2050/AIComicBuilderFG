import OpenAI from "openai";
import type { ImageOptions } from "../types";
import * as fs from "node:fs";
import * as path from "node:path";
import { ulid } from "ulid";

/**
 * OpenAI 图片生成 Provider
 * 使用 DALL-E API 生成图片，支持文生图和图生图
 */
export class OpenAIImageProvider {
  private client: OpenAI;
  private defaultModel: string;
  private uploadDir: string;

  constructor(params?: {
    apiKey?: string;
    baseURL?: string;
    model?: string;
    uploadDir?: string;
  }) {
    // 使用独立的图像生成 API 配置
    this.client = new OpenAI({
      apiKey: params?.apiKey || process.env.OPENAI_IMAGE_API_KEY,
      baseURL: params?.baseURL || process.env.OPENAI_IMAGE_BASE_URL || "https://api.openai.com/v1",
    });
    this.defaultModel = params?.model || process.env.OPENAI_IMAGE_MODEL || "dall-e-3";
    this.uploadDir = params?.uploadDir || process.env.UPLOAD_DIR || "./uploads";
  }

  /**
   * 不支持文本生成
   */
  async generateText(_prompt: string, _options?: unknown): Promise<string> {
    throw new Error("OpenAIImageProvider 不支持文本生成");
  }

  /**
   * 生成图片 - 使用 DALL-E 或兼容 API
   * 支持图生图：当提供 referenceImage 时，使用图片编辑模式（DALL-E 2 或兼容 API）
   * @param prompt 提示词
   * @param options 图片选项，包含 referenceImage 用于图生图
   * @param _onPromptIdSubmit OpenAI 模式下不支持，回调会被忽略
   */
  async generateImage(
    prompt: string, 
    options?: ImageOptions, 
    _onPromptIdSubmit?: (promptId: string) => void | Promise<void>
  ): Promise<string> {
    const model = options?.model || this.defaultModel;
    console.log(`[OpenAI Image] Generating image with model: ${model}`);

    // 解析尺寸
    let size: "1024x1024" | "1792x1024" | "1024x1792" | "512x512" | "256x256" = "1024x1024";
    if (options?.size) {
      const [w, h] = options.size.split("x").map(Number);
      if (w === 1792 && h === 1024) size = "1792x1024";
      else if (w === 1024 && h === 1792) size = "1024x1792";
      else if (w === 1024 && h === 1024) size = "1024x1024";
      else if (w === 1280 && h === 720) size = "1792x1024"; // 接近 16:9
      else if (w === 720 && h === 1280) size = "1024x1792"; // 接近 9:16
      else if (w === 512 && h === 512) size = "512x512";
      else if (w === 256 && h === 256) size = "256x256";
    }

    // 处理 prompt 长度限制
    const truncatedPrompt = prompt.length > 4000 ? prompt.substring(0, 3997) + "..." : prompt;

    try {
      // 检查是否使用图生图模式（提供 referenceImage）
      if (options?.referenceImage) {
        console.log(`[OpenAI Image] Using image edit mode with reference: ${options.referenceImage}`);
        
        // 读取参考图并转为 base64
        const refImageData = await this.readImageAsBase64(options.referenceImage);
        
        // DALL-E 3 不支持编辑，降级到 DALL-E 2
        const editModel = model.includes("dall-e-3") ? "dall-e-2" : model;
        
        // 直接使用 fetch 调用图片编辑 API
        const apiUrl = (this.client as unknown as { baseURL: string }).baseURL || "https://api.openai.com/v1";
        const apiKey = (this.client as unknown as { apiKey: string }).apiKey;
        
        const response = await fetch(`${apiUrl}/images/generations`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: editModel,
            prompt: truncatedPrompt,
            image: refImageData,
            n: 1,
            size,
            response_format: "url",
          }),
        });
        
        if (!response.ok) {
          throw new Error(`图片编辑 API 失败: ${response.status} ${await response.text()}`);
        }
        
        return this.downloadAndSaveImage(await response.json() as OpenAI.ImagesResponse);
      }

      // 文生图模式
      const response = await this.client.images.generate({
        model,
        prompt: truncatedPrompt,
        n: 1,
        size,
        quality: options?.quality || "standard",
        response_format: "url",
      });

      return this.downloadAndSaveImage(response);
    } catch (error) {
      throw new Error(
        `OpenAI 图片生成失败: ${error instanceof Error ? error.message : "未知错误"}`
      );
    }
  }

  /**
   * 读取图片并转为 base64
   */
  private async readImageAsBase64(imagePath: string): Promise<string> {
    if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
      const res = await fetch(imagePath);
      if (!res.ok) throw new Error(`Failed to fetch: ${imagePath}`);
      return Buffer.from(await res.arrayBuffer()).toString("base64");
    }
    return fs.readFileSync(imagePath).toString("base64");
  }

  /**
   * 下载并保存图片
   */
  private async downloadAndSaveImage(
    response: OpenAI.ImagesResponse
  ): Promise<string> {
    const imageData = response.data?.[0];
    if (!imageData?.url) {
      throw new Error("API 未返回图片 URL");
    }

    console.log(`[OpenAI Image] Downloading from: ${imageData.url}`);
    const imageResponse = await fetch(imageData.url);
    if (!imageResponse.ok) {
      throw new Error(`下载图片失败: ${imageResponse.status}`);
    }

    const filename = `${ulid()}.png`;
    const dir = path.join(this.uploadDir, "frames");
    fs.mkdirSync(dir, { recursive: true });
    const filepath = path.join(dir, filename);

    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    fs.writeFileSync(filepath, buffer);

    console.log(`[OpenAI Image] Saved to: ${filepath}`);
    return filepath;
  }
}

// 默认实例
let defaultProvider: OpenAIImageProvider | null = null;

export function getOpenAIImageProvider(): OpenAIImageProvider {
  if (!defaultProvider) {
    defaultProvider = new OpenAIImageProvider();
  }
  return defaultProvider;
}
