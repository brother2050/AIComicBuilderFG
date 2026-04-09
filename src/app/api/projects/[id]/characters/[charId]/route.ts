/**
 * 单个角色管理 API
 * 支持更新、删除角色
 */
import { NextResponse } from "next/server";
import { db, characters } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; charId: string }> }
) {
  const { id: projectId, charId } = await params;
  
  try {
    const char = await db.query.characters.findFirst({
      where: eq(characters.id, charId),
    });

    if (!char || char.projectId !== projectId) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    return NextResponse.json({ character: char });
  } catch (error) {
    console.error("[API] Failed to get character:", error);
    return NextResponse.json(
      { error: "Failed to get character" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; charId: string }> }
) {
  const { id: projectId, charId } = await params;
  
  try {
    const body = await request.json();
    const { name, description, visualHint, scope, referenceImage } = body;

    // 验证角色存在
    const existingChar = await db.query.characters.findFirst({
      where: eq(characters.id, charId),
    });

    if (!existingChar || existingChar.projectId !== projectId) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    // 更新角色
    await db.update(characters)
      .set({
        name: name !== undefined ? name : existingChar.name,
        description: description !== undefined ? description : existingChar.description,
        visualHint: visualHint !== undefined ? visualHint : existingChar.visualHint,
        scope: scope !== undefined ? scope : existingChar.scope,
        referenceImage: referenceImage !== undefined ? referenceImage : existingChar.referenceImage,
      })
      .where(eq(characters.id, charId));

    const updatedChar = await db.query.characters.findFirst({
      where: eq(characters.id, charId),
    });

    return NextResponse.json({ 
      success: true, 
      character: updatedChar 
    });
  } catch (error) {
    console.error("[API] Failed to update character:", error);
    return NextResponse.json(
      { error: "Failed to update character" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; charId: string }> }
) {
  const { id: projectId, charId } = await params;
  
  try {
    // 验证角色存在
    const existingChar = await db.query.characters.findFirst({
      where: eq(characters.id, charId),
    });

    if (!existingChar || existingChar.projectId !== projectId) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    await db.delete(characters).where(eq(characters.id, charId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Failed to delete character:", error);
    return NextResponse.json(
      { error: "Failed to delete character" },
      { status: 500 }
    );
  }
}
