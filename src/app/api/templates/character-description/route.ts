/**
 * 角色描述模板管理 API
 */
import { NextRequest, NextResponse } from "next/server";
import { db, templates } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { DEFAULT_CHARACTER_DESCRIPTION_TEMPLATE } from "@/lib/prompts/templates/character-description";

// 获取所有模板列表
export async function GET() {
  try {
    const allTemplates = await db.query.templates.findMany({
      where: eq(templates.type, "character_description"),
      orderBy: (t, { desc }) => [desc(t.isDefault), desc(t.updatedAt)],
    });

    return NextResponse.json({
      success: true,
      templates: allTemplates,
    });
  } catch (error) {
    console.error("[API] Failed to fetch templates:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch templates" },
      { status: 500 }
    );
  }
}

// 创建新模板（从现有模板复制并修改）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, systemPrompt, copyFromId } = body;

    if (!name || !systemPrompt) {
      return NextResponse.json(
        { success: false, error: "Name and system prompt are required" },
        { status: 400 }
      );
    }

    // 检查是否已存在同名模板（同一项目下）
    if (body.projectId) {
      const existing = await db.query.templates.findFirst({
        where: (t, { and, eq }) => and(
          eq(t.type, "character_description"),
          eq(t.name, name),
          eq(t.projectId, body.projectId)
        ),
      });
      if (existing) {
        return NextResponse.json(
          { success: false, error: "Template with this name already exists for this project" },
          { status: 400 }
        );
      }
    }

    const newTemplate = {
      id: ulid(),
      name,
      description: description || "",
      type: "character_description" as const,
      systemPrompt,
      projectId: body.projectId || null,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(templates).values(newTemplate);

    return NextResponse.json({
      success: true,
      template: newTemplate,
    });
  } catch (error) {
    console.error("[API] Failed to create template:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create template" },
      { status: 500 }
    );
  }
}

// 更新模板
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, description, systemPrompt } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Template ID is required" },
        { status: 400 }
      );
    }

    // 检查是否为默认模板
    const existing = await db.query.templates.findFirst({
      where: eq(templates.id, id),
    });

    if (existing?.isDefault) {
      return NextResponse.json(
        { success: false, error: "Default template cannot be modified. Create a new template instead." },
        { status: 403 }
      );
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (systemPrompt) updateData.systemPrompt = systemPrompt;

    await db.update(templates)
      .set(updateData)
      .where(eq(templates.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Failed to update template:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update template" },
      { status: 500 }
    );
  }
}

// 删除模板（非默认模板）
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Template ID is required" },
        { status: 400 }
      );
    }

    // 检查是否为默认模板
    const existing = await db.query.templates.findFirst({
      where: eq(templates.id, id),
    });

    if (existing?.isDefault) {
      return NextResponse.json(
        { success: false, error: "Default template cannot be deleted" },
        { status: 403 }
      );
    }

    await db.delete(templates).where(eq(templates.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Failed to delete template:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete template" },
      { status: 500 }
    );
  }
}
