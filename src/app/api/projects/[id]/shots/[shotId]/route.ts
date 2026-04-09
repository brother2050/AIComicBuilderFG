/**
 * 单个分镜管理 API
 * 支持更新、删除分镜
 */
import { NextResponse } from "next/server";
import { db, shots, dialogues } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; shotId: string }> }
) {
  const { id: projectId, shotId } = await params;
  
  try {
    const shot = await db.query.shots.findFirst({
      where: eq(shots.id, shotId),
    });

    if (!shot || shot.projectId !== projectId) {
      return NextResponse.json({ error: "Shot not found" }, { status: 404 });
    }

    // 获取分镜的对白
    const shotDialogues = await db.query.dialogues.findMany({
      where: eq(dialogues.shotId, shotId),
      orderBy: (d, { asc }) => [asc(d.sequence)],
    });

    return NextResponse.json({ 
      shot, 
      dialogues: shotDialogues 
    });
  } catch (error) {
    console.error("[API] Failed to get shot:", error);
    return NextResponse.json(
      { error: "Failed to get shot" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; shotId: string }> }
) {
  const { id: projectId, shotId } = await params;
  
  try {
    const body = await request.json();
    const { 
      sceneDescription, 
      startFrameDesc, 
      endFrameDesc, 
      motionScript,
      videoScript,
      cameraDirection,
      duration,
      dialogues: newDialogues,
    } = body;

    // 验证分镜存在
    const existingShot = await db.query.shots.findFirst({
      where: eq(shots.id, shotId),
    });

    if (!existingShot || existingShot.projectId !== projectId) {
      return NextResponse.json({ error: "Shot not found" }, { status: 404 });
    }

    // 更新分镜
    await db.update(shots)
      .set({
        sceneDescription: sceneDescription !== undefined ? sceneDescription : existingShot.sceneDescription,
        startFrameDesc: startFrameDesc !== undefined ? startFrameDesc : existingShot.startFrameDesc,
        endFrameDesc: endFrameDesc !== undefined ? endFrameDesc : existingShot.endFrameDesc,
        motionScript: motionScript !== undefined ? motionScript : existingShot.motionScript,
        videoScript: videoScript !== undefined ? videoScript : existingShot.videoScript,
        cameraDirection: cameraDirection !== undefined ? cameraDirection : existingShot.cameraDirection,
        duration: duration !== undefined ? duration : existingShot.duration,
        // 重置生成状态当描述改变时
        status: (startFrameDesc !== undefined || endFrameDesc !== undefined) ? "pending" : existingShot.status,
        firstFrame: (startFrameDesc !== undefined) ? null : existingShot.firstFrame,
        lastFrame: (endFrameDesc !== undefined) ? null : existingShot.lastFrame,
        videoUrl: (startFrameDesc !== undefined || endFrameDesc !== undefined) ? null : existingShot.videoUrl,
      })
      .where(eq(shots.id, shotId));

    // 更新对白（如果提供）
    if (newDialogues && Array.isArray(newDialogues)) {
      // 删除现有对白
      await db.delete(dialogues).where(eq(dialogues.shotId, shotId));
      
      // 插入新对白
      for (let i = 0; i < newDialogues.length; i++) {
        const d = newDialogues[i];
        if (d.text) {
          await db.insert(dialogues).values({
            id: d.id || `dialogue-${Date.now()}-${i}`,
            shotId,
            characterName: d.characterName || d.character || "",
            text: d.text,
            emotion: d.emotion || "",
            sequence: i,
          });
        }
      }
    }

    const updatedShot = await db.query.shots.findFirst({
      where: eq(shots.id, shotId),
    });

    const updatedDialogues = await db.query.dialogues.findMany({
      where: eq(dialogues.shotId, shotId),
      orderBy: (d, { asc }) => [asc(d.sequence)],
    });

    return NextResponse.json({ 
      success: true, 
      shot: updatedShot,
      dialogues: updatedDialogues,
    });
  } catch (error) {
    console.error("[API] Failed to update shot:", error);
    return NextResponse.json(
      { error: "Failed to update shot" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; shotId: string }> }
) {
  const { id: projectId, shotId } = await params;
  
  try {
    // 验证分镜存在
    const existingShot = await db.query.shots.findFirst({
      where: eq(shots.id, shotId),
    });

    if (!existingShot || existingShot.projectId !== projectId) {
      return NextResponse.json({ error: "Shot not found" }, { status: 404 });
    }

    await db.delete(shots).where(eq(shots.id, shotId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Failed to delete shot:", error);
    return NextResponse.json(
      { error: "Failed to delete shot" },
      { status: 500 }
    );
  }
}
