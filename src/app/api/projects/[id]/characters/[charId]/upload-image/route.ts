/**
 * 角色图上传 API
 * 支持上传角色参考图
 */
import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { db, characters } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; charId: string }> }
) {
  const { id: projectId, charId } = await params;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // 验证文件类型
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only PNG, JPG, WEBP, GIF are allowed." },
        { status: 400 }
      );
    }

    // 验证文件大小 (最大 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    // 验证角色存在
    const existingChar = await db.query.characters.findFirst({
      where: eq(characters.id, charId),
    });

    if (!existingChar || existingChar.projectId !== projectId) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    // 创建上传目录
    const uploadDir = process.env.UPLOAD_DIR || "./uploads";
    const projectDir = path.join(uploadDir, "projects", projectId, "characters");
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    // 生成文件名
    const ext = path.extname(file.name) || `.${file.type.split("/")[1]}`;
    const fileName = `${charId}_${ulid()}${ext}`;
    const filePath = path.join(projectDir, fileName);

    // 保存文件
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    // 计算相对路径
    const relativePath = path.join("projects", projectId, "characters", fileName);

    // 更新角色表的 referenceImage
    await db.update(characters)
      .set({ referenceImage: relativePath })
      .where(eq(characters.id, charId));

    console.log(`[Character Upload] Saved character image: ${relativePath}`);

    return NextResponse.json({
      success: true,
      path: relativePath,
      url: `/api/uploads/${relativePath.replace(/\\/g, "/")}`,
    });
  } catch (error) {
    console.error("[Character Upload] Failed:", error);
    return NextResponse.json(
      { error: "Failed to upload character image" },
      { status: 500 }
    );
  }
}
