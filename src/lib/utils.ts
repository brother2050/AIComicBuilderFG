import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 风格描述映射
 */
export const STYLE_DESCRIPTIONS: Record<string, string> = {
  anime: "Anime art style, cel-shaded, dramatic lighting",
  realistic: "Photorealistic photography style, 85mm lens, cinematic lighting",
  "3d": "3D render style, Pixar/Disney quality, soft lighting",
  cartoon: "Cartoon illustration style, bold lines, vibrant colors",
};

/**
 * 获取风格描述
 */
export function getStyleDescription(style: string): string {
  return STYLE_DESCRIPTIONS[style] || STYLE_DESCRIPTIONS.anime;
}

/**
 * 获取中文风格名称
 */
export function getStyleNameCN(style: string): string {
  switch (style) {
    case "anime": return "日漫风格";
    case "realistic": return "写实风格";
    case "3d": return "3D动画风格";
    case "cartoon": return "卡通风格";
    default: return "日漫风格";
  }
}

/**
 * 将本地文件路径转换为可访问的 URL
 * 本地路径: ./uploads/frames/xxx.png 或 uploads/frames/xxx.png
 * 访问路径: /api/uploads/frames/xxx.png
 */
export function getFileUrl(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  
  // 如果是完整的 URL（包含 http），直接返回
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
    return filePath;
  }
  
  // 移除 ./ 或 / 前缀，提取相对路径
  let relativePath = filePath;
  if (relativePath.startsWith("./")) {
    relativePath = relativePath.slice(2);
  }
  if (relativePath.startsWith("/")) {
    relativePath = relativePath.slice(1);
  }
  
  // 移除开头的 uploads/ 避免重复
  if (relativePath.startsWith("uploads/")) {
    relativePath = relativePath.slice(8);
  }
  
  return `/api/uploads/${relativePath}`;
}
