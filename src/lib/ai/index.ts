// AI模块导出
export * from "./types";
export { OpenAIProvider, getOpenAIProvider } from "./providers/openai";
export { OpenAIImageProvider, getOpenAIImageProvider } from "./providers/openai-image";
export { 
  ComfyUIImageProvider, 
  ComfyUIVideoProvider,
  getComfyUIImageProvider, 
  getComfyUIVideoProvider,
  fetchComfyUIImageByPromptId 
} from "./providers/comfyui";

/**
 * 图像生成 Provider 类型
 */
export type ImageProviderType = "openai" | "comfyui";

// 内部导入用于 getImageProvider
import { getOpenAIImageProvider } from "./providers/openai-image";
import { getComfyUIImageProvider } from "./providers/comfyui";

/**
 * 获取图像生成 Provider
 * 根据配置选择使用 OpenAI (DALL-E) 或 ComfyUI
 */
export function getImageProvider(type?: ImageProviderType): import("./types").AIProvider {
  // 优先使用环境变量 IMAGE_PROVIDER，未设置则根据参数或默认 ComfyUI
  const providerType = type || (process.env.IMAGE_PROVIDER as ImageProviderType) || "comfyui";
  
  if (providerType === "openai") {
    return getOpenAIImageProvider();
  }
  
  return getComfyUIImageProvider();
}

/**
 * 获取图像生成 Provider 类型
 */
export function getImageProviderType(): ImageProviderType {
  return (process.env.IMAGE_PROVIDER as ImageProviderType) || "comfyui";
}
