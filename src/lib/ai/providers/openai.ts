import OpenAI from "openai";
import type { AIProvider, TextOptions, ImageOptions } from "../types";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * OpenAI Provider - 用于文本生成
 * 支持流式输出
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
    const apiKey = params?.apiKey || process.env.OPENAI_API_KEY || "";
    const baseURL = params?.baseURL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    const model = params?.model || process.env.OPENAI_MODEL || "gpt-4o";

    console.log(`[OpenAI] Initializing provider:`, {
      baseURL,
      model,
      hasApiKey: !!apiKey,
      apiKeyPrefix: apiKey ? `${apiKey.slice(0, 8)}...` : "none",
      timeout: "5min",
    });

    this.client = new OpenAI({
      apiKey,
      baseURL,
      timeout: 300000, // 5分钟超时
    });
    this.defaultModel = model;
    this.uploadDir = params?.uploadDir || process.env.UPLOAD_DIR || "./uploads";
  }

  /**
   * 生成文本 - 使用OpenAI GPT模型
   * 支持流式输出，通过 onChunk 回调实时推送内容
   */
  async generateText(prompt: string, options?: TextOptions): Promise<string> {
    const useStream = options?.stream ?? false;
    const model = options?.model || this.defaultModel;
    const temperature = options?.temperature ?? 0.7;
    const maxTokens = options?.maxTokens ?? 12000;

    console.log(`[OpenAI] Text generation request:`, {
      model,
      temperature,
      maxTokens,
      stream: useStream,
      hasSystemPrompt: !!options?.systemPrompt,
      systemPromptLength: options?.systemPrompt?.length || 0,
      promptLength: prompt.length,
      promptPreview: prompt.slice(0, 200) + (prompt.length > 200 ? "..." : ""),
      hasImages: !!options?.images?.length,
      imageCount: options?.images?.length || 0,
    });

    const startTime = Date.now();

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

    try {
      // 流式输出
      if (useStream) {
        const stream = await this.client.chat.completions.create({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          stream: true,
        });

        let fullContent = "";
        let chunkCount = 0;

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            fullContent += content;
            chunkCount++;
            // 调用回调（如果有）
            if (options?.onChunk) {
              options.onChunk(content);
            }
          }
        }

        const duration = Date.now() - startTime;
        console.log(`[OpenAI] Stream completed:`, {
          duration: `${duration}ms`,
          chunks: chunkCount,
          responseLength: fullContent.length,
          responsePreview: fullContent.slice(0, 300) + (fullContent.length > 300 ? "..." : ""),
        });
        return fullContent;
      }

      // 非流式输出
      const response = await this.client.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      });

      const duration = Date.now() - startTime;
      const content = response.choices[0]?.message?.content || "";
      console.log(`[OpenAI] Text generation completed:`, {
        duration: `${duration}ms`,
        responseLength: content.length,
        responsePreview: content.slice(0, 300) + (content.length > 300 ? "..." : ""),
      });
      
      return content;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[OpenAI] Text generation failed after ${duration}ms:`, error);
      throw error;
    }
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
