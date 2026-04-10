/**
 * 项目工作流文件上传 API
 * 支持上传 ComfyUI 工作流 JSON 文件（支持图片或视频）
 */
import { NextRequest, NextResponse } from "next/server";
import { db, projects } from "@/lib/db";
import { eq } from "drizzle-orm";

/**
 * POST /api/projects/[id]/workflow/upload
 * 上传工作流 JSON 文件
 * 
 * Form data:
 * - file: 工作流 JSON 文件
 * - type: 'image' | 'video' (默认 'video')
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 验证项目存在
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, id),
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // 解析 multipart/form-data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = (formData.get("type") as string) || "video";

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    // 验证文件类型
    if (!file.name.endsWith(".json")) {
      return NextResponse.json(
        { error: "Only JSON files are allowed" },
        { status: 400 }
      );
    }

    // 读取文件内容
    const fileContent = await file.text();

    // 验证 JSON 格式
    let workflow: Record<string, unknown>;
    try {
      workflow = JSON.parse(fileContent);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON format" },
        { status: 400 }
      );
    }

    // 验证基本工作流结构（应该有节点）
    if (!workflow || typeof workflow !== "object" || Object.keys(workflow).length === 0) {
      return NextResponse.json(
        { error: "Invalid workflow: empty or missing nodes" },
        { status: 400 }
      );
    }

    // 选择正确的工作流字段
    const workflowField = type === "image" ? "imageWorkflow" : "videoWorkflow";

    // 存储工作流
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    updateData[workflowField] = JSON.stringify({
      ...workflow,
      _type: type,
      _fileName: file.name,
    });

    await db.update(projects)
      .set(updateData)
      .where(eq(projects.id, id));

    // 返回节点数量等信息
    const nodeCount = Object.keys(workflow).length;
    const classTypes = new Set<string>();
    for (const node of Object.values(workflow)) {
      if (typeof node === "object" && node !== null) {
        const n = node as Record<string, unknown>;
        if (n.class_type) {
          classTypes.add(n.class_type as string);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `${type === "image" ? "图片" : "视频"}工作流上传成功`,
      projectId: id,
      fileName: file.name,
      type,
      nodeCount,
      classTypes: Array.from(classTypes),
    });
  } catch (error) {
    console.error("[API] Failed to upload workflow:", error);
    return NextResponse.json(
      { error: "Failed to upload workflow" },
      { status: 500 }
    );
  }
}
