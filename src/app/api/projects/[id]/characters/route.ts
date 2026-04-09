/**
 * 角色管理 API
 * 支持创建、更新、删除角色
 */
import { NextResponse } from "next/server";
import { db, characters, projects } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  
  try {
    const chars = await db.query.characters.findMany({
      where: eq(characters.projectId, projectId),
    });

    return NextResponse.json({ characters: chars });
  } catch (error) {
    console.error("[API] Failed to get characters:", error);
    return NextResponse.json(
      { error: "Failed to get characters" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  
  try {
    const body = await request.json();
    const { name, description, visualHint, scope, referenceImage } = body;

    if (!name) {
      return NextResponse.json({ error: "Character name is required" }, { status: 400 });
    }

    // 验证项目存在
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const characterId = ulid();
    await db.insert(characters).values({
      id: characterId,
      projectId,
      name,
      description: description || "",
      visualHint: visualHint || "",
      referenceImage: referenceImage || null,
      scope: scope || "main",
    });

    const newChar = await db.query.characters.findFirst({
      where: eq(characters.id, characterId),
    });

    return NextResponse.json({ 
      success: true, 
      character: newChar 
    });
  } catch (error) {
    console.error("[API] Failed to create character:", error);
    return NextResponse.json(
      { error: "Failed to create character" },
      { status: 500 }
    );
  }
}
