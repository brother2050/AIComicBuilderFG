/**
 * 文件系统工具函数
 */
import * as fs from "fs";
import * as path from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

/**
 * 删除项目目录及其所有内容
 */
export async function deleteProjectFiles(projectId: string): Promise<void> {
  const projectDir = path.join(UPLOAD_DIR, "projects", projectId);
  
  if (fs.existsSync(projectDir)) {
    fs.rmSync(projectDir, { recursive: true, force: true });
    console.log(`[FileCleanup] Deleted project directory: ${projectDir}`);
  }

  // 同时删除根目录下的项目相关文件（兼容旧结构）
  const legacyDirs = ["frames", "videos", "characters"];
  for (const dir of legacyDirs) {
    const legacyDir = path.join(UPLOAD_DIR, dir);
    if (fs.existsSync(legacyDir)) {
      // 删除该目录下所有包含 projectId 的文件
      try {
        const files = fs.readdirSync(legacyDir);
        for (const file of files) {
          if (file.includes(projectId)) {
            const filePath = path.join(legacyDir, file);
            fs.rmSync(filePath, { force: true });
            console.log(`[FileCleanup] Deleted legacy file: ${filePath}`);
          }
        }
      } catch (e) {
        console.warn(`[FileCleanup] Failed to clean legacy dir ${dir}: ${e}`);
      }
    }
  }
}

/**
 * 删除角色图片
 */
export async function deleteCharacterImage(relativePath: string): Promise<void> {
  if (!relativePath) return;
  
  // 移除开头的 /api/uploads/ 前缀
  let filePath = relativePath;
  if (filePath.startsWith("/api/uploads/")) {
    filePath = filePath.replace("/api/uploads/", "");
  }
  
  const fullPath = path.join(UPLOAD_DIR, filePath);
  
  if (fs.existsSync(fullPath)) {
    fs.rmSync(fullPath, { force: true });
    console.log(`[FileCleanup] Deleted character image: ${fullPath}`);
  }
}

/**
 * 删除分镜帧图
 */
export async function deleteFrameImage(filePath: string): Promise<void> {
  if (!filePath) return;
  
  // 处理绝对路径或相对路径
  let fullPath = filePath;
  if (!path.isAbsolute(fullPath)) {
    fullPath = path.join(UPLOAD_DIR, fullPath);
  }
  
  if (fs.existsSync(fullPath)) {
    fs.rmSync(fullPath, { force: true });
    console.log(`[FileCleanup] Deleted frame image: ${fullPath}`);
  }
}

/**
 * 删除视频文件
 */
export async function deleteVideoFile(filePath: string): Promise<void> {
  if (!filePath) return;
  
  let fullPath = filePath;
  if (!path.isAbsolute(fullPath)) {
    fullPath = path.join(UPLOAD_DIR, fullPath);
  }
  
  if (fs.existsSync(fullPath)) {
    fs.rmSync(fullPath, { force: true });
    console.log(`[FileCleanup] Deleted video file: ${fullPath}`);
  }
}

/**
 * 确保目录存在
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 获取项目的帧图目录
 */
export function getProjectFramesDir(projectId: string): string {
  return path.join(UPLOAD_DIR, "projects", projectId, "frames");
}

/**
 * 获取项目的视频目录
 */
export function getProjectVideosDir(projectId: string): string {
  return path.join(UPLOAD_DIR, "projects", projectId, "videos");
}

/**
 * 获取项目的角色图目录
 */
export function getProjectCharactersDir(projectId: string): string {
  return path.join(UPLOAD_DIR, "projects", projectId, "characters");
}
