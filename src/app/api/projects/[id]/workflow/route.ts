/**
 * 项目工作流配置 API
 * 支持上传和获取项目的自定义图片/视频生成工作流
 */
import { NextRequest, NextResponse } from "next/server";
import { db, projects } from "@/lib/db";
import { eq } from "drizzle-orm";

interface WorkflowPayload {
  workflow: Record<string, unknown> | null;
  templateName?: string | null;
  type?: "image" | "video"; // 工作流类型
}

interface ImageWorkflowParams {
  workflowFile?: string;
  width?: number;
  height?: number;
  steps?: number;
}

/**
 * GET /api/projects/[id]/workflow
 * 获取项目的工作流配置
 * Query params:
 * - type: 'image' | 'video' (默认 'video')
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "video";

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, id),
      columns: {
        id: true,
        title: true,
        imageWorkflow: true,
        videoWorkflow: true,
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // 根据类型选择工作流字段
    const workflowField = type === "image" ? project.imageWorkflow : project.videoWorkflow;
    
    let workflowData = null;
    let templateName: string | null = null;

    if (workflowField) {
      try {
        const parsed = JSON.parse(workflowField);
        workflowData = parsed;
        templateName = parsed._templateId || parsed.templateName || null;
      } catch {
        workflowData = null;
      }
    }

    // 提取节点类型
    let classTypes: string[] = [];
    if (workflowData && typeof workflowData === "object") {
      const types = new Set<string>();
      for (const node of Object.values(workflowData)) {
        if (typeof node === "object" && node !== null) {
          const n = node as Record<string, unknown>;
          if (n.class_type) {
            types.add(n.class_type as string);
          }
        }
      }
      classTypes = Array.from(types);
    }

    return NextResponse.json({
      projectId: project.id,
      title: project.title,
      type,
      hasWorkflow: !!workflowField,
      workflow: workflowData,
      templateName,
      classTypes,
    });
  } catch (error) {
    console.error("[API] Failed to get workflow:", error);
    return NextResponse.json(
      { error: "Failed to get workflow" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/projects/[id]/workflow
 * 更新项目的工作流配置
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { workflow, templateName, type = "video", imageWorkflowParams } = body;

    // 验证项目存在
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, id),
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // 如果是更新图像参数（仅参数，不含工作流）
    if (imageWorkflowParams && !workflow) {
      const { workflowFile, width, height, steps } = imageWorkflowParams as ImageWorkflowParams;

      // 获取现有工作流
      let existingWorkflow = null;
      if (project.imageWorkflow) {
        try {
          existingWorkflow = JSON.parse(project.imageWorkflow);
        } catch {
          existingWorkflow = {};
        }
      }

      // 更新参数
      const updatedWorkflow = {
        ...existingWorkflow,
        _workflowFile: workflowFile || existingWorkflow?._workflowFile || "image_z_image_turbo.json",
        _width: width || existingWorkflow?._width || 1024,
        _height: height || existingWorkflow?._height || 1024,
        _steps: steps || existingWorkflow?._steps || 8,
      };

      await db.update(projects)
        .set({
          imageWorkflow: JSON.stringify(updatedWorkflow),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id));

      return NextResponse.json({
        success: true,
        message: "图像生成参数已更新",
        projectId: id,
      });
    }

    // 选择正确的工作流字段
    const workflowField = type === "image" ? "imageWorkflow" : "videoWorkflow";

    // 清除工作流
    if (workflow === null) {
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      updateData[workflowField] = null;

      await db.update(projects)
        .set(updateData)
        .where(eq(projects.id, id));

      return NextResponse.json({
        success: true,
        message: `${type === "image" ? "图片" : "视频"}工作流已清除`,
        projectId: id,
      });
    }

    // 验证工作流格式
    if (!workflow || typeof workflow !== "object") {
      return NextResponse.json(
        { error: "Invalid workflow format" },
        { status: 400 }
      );
    }

    // 添加模板信息到工作流
    const workflowWithMeta = {
      ...workflow,
      templateName: templateName || null,
      _type: type, // 标记工作流类型
    };

    // 存储工作流 JSON
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    updateData[workflowField] = JSON.stringify(workflowWithMeta);

    await db.update(projects)
      .set(updateData)
      .where(eq(projects.id, id));

    return NextResponse.json({
      success: true,
      message: `${type === "image" ? "图片" : "视频"}工作流已更新`,
      projectId: id,
      templateName,
      type,
    });
  } catch (error) {
    console.error("[API] Failed to update workflow:", error);
    return NextResponse.json(
      { error: "Failed to update workflow" },
      { status: 500 }
    );
  }
}
