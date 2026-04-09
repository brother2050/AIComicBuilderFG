import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: filePath } = await params;
  const uploadDir = process.env.UPLOAD_DIR || "./uploads";
  const fullPath = path.join(uploadDir, ...filePath);

  // 安全检查：确保文件在 uploads 目录内
  const normalizedPath = path.normalize(fullPath);
  if (!normalizedPath.startsWith(path.normalize(uploadDir))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!fs.existsSync(normalizedPath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ext = path.extname(normalizedPath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
  };

  const contentType = mimeTypes[ext] || "application/octet-stream";
  const fileBuffer = fs.readFileSync(normalizedPath);

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000",
    },
  });
}
