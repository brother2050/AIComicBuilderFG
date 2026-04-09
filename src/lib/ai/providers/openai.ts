import OpenAI from "openai";
import type { AIProvider, TextOptions, ImageOptions } from "../types";
import * as fs from "node:fs";
import * as path from "node:path";
import { ulid } from "ulid";

/**
 * OpenAI Provider - 用于文本生成
 * 生文使用OpenAI API (GPT-4o等)
 */
export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private defaultModel: string;
  private uploadDir: string;

  constructor(params?: { 
    apiKey?: string; 
    baseURL?: string; 
    model?: string; 
    uploadDir?: string; 
  }) {
    this.client = new OpenAI({
      apiKey: params?.apiKey || process.env.OPENAI_API_KEY,
      baseURL: params?.baseURL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    });
    this.defaultModel = params?.model || process.env.OPENAI_MODEL || "gpt-4o";
    this.uploadDir = params?.uploadDir || process.env.UPLOAD_DIR || "./uploads";
  }

  /**
   * 生成文本 - 使用OpenAI GPT模型
   */
  async generateText(prompt: string, options?: TextOptions): Promise<string> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    
    if (options?.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    }

    // 支持Vision API - 如果有图片，使用多模态
    if (options?.images?.length) {
      const content: OpenAI.Chat.ChatCompletionContentPart[] = [];
      for (const imgPath of options.images) {
        try {
          const resolved = path.resolve(imgPath);
          if (fs.existsSync(resolved)) {
            const data = fs.readFileSync(resolved).toString("base64");
            const ext = path.extname(resolved).toLowerCase();
            const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
            content.push({ 
              type: "image_url", 
              image_url: { url: `data:${mimeType};base64,${data}` } 
            });
          }
        } catch { /* skip unreadable */ }
      }
      content.push({ type: "text", text: prompt });
      messages.push({ role: "user", content });
    } else {
      messages.push({ role: "user", content: prompt });
    }

    const response = await this.client.chat.completions.create({
      model: options?.model || this.defaultModel,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
    });

    return response.choices[0]?.message?.content || "";
  }

  /**
   * OpenAI不支持直接生成图片，此方法会抛出错误
   * 图片生成应使用ComfyUI
   */
  async generateImage(_prompt: string, _options?: ImageOptions): Promise<string> {
    throw new Error("OpenAI Provider不支持图片生成，请使用ComfyUI");
  }
}

// 创建默认实例的工厂函数
let defaultProvider: OpenAIProvider | null = null;

export function getOpenAIProvider(): OpenAIProvider {
  if (!defaultProvider) {
    defaultProvider = new OpenAIProvider();
  }
  return defaultProvider;
}
