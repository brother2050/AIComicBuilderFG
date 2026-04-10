/**
 * 恢复 ComfyUI 图片 API
 * 检查有 promptId 但没有图片的记录，尝试从 ComfyUI 恢复图片
 */
import { NextResponse } from "next/server";
import { db, characters, shots } from "@/lib/db";
import { eq } from "drizzle-orm";
import { recoverImageByPromptId as fetchComfyUIImageByPromptId } from "@/lib/ai/providers/comfyui";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  try {
    console.log(`[Recover] Starting recovery for project: ${projectId}`);

    let recoveredCount = 0;
    let failedCount = 0;

    // 1. 恢复角色参考图
    const chars = await db.query.characters.findMany({
      where: eq(characters.projectId, projectId),
    });

    for (const char of chars) {
      if (char.comfyuiPromptId && !char.referenceImage) {
        try {
          console.log(`[Recover] Checking character ${char.name} with promptId: ${char.comfyuiPromptId}`);
          const savedPath = await fetchComfyUIImageByPromptId(char.comfyuiPromptId);
          if (savedPath) {
            await db.update(characters)
              .set({ referenceImage: savedPath, comfyuiPromptId: null })
              .where(eq(characters.id, char.id));
            recoveredCount++;
            console.log(`[Recover] Recovered character image: ${char.name} -> ${savedPath}`);
          } else {
            await db.update(characters)
              .set({ comfyuiPromptId: null })
              .where(eq(characters.id, char.id));
            failedCount++;
            console.log(`[Recover] No image found for character ${char.name}, cleared promptId`);
          }
        } catch (err) {
          await db.update(characters)
            .set({ comfyuiPromptId: null })
            .where(eq(characters.id, char.id));
          failedCount++;
          console.warn(`[Recover] Failed to recover character image ${char.name}:`, err);
        }
      }
    }

    // 2. 恢复分镜帧图
    const projectShots = await db.query.shots.findMany({
      where: eq(shots.projectId, projectId),
    });

    for (const shot of projectShots) {
      // 恢复首帧
      if (shot.firstFramePromptId && !shot.firstFrame) {
        try {
          console.log(`[Recover] Checking shot ${shot.sequence} firstFrame with promptId: ${shot.firstFramePromptId}`);
          const savedPath = await fetchComfyUIImageByPromptId(shot.firstFramePromptId);
          if (savedPath) {
            await db.update(shots)
              .set({ firstFrame: savedPath, firstFramePromptId: null })
              .where(eq(shots.id, shot.id));
            recoveredCount++;
            console.log(`[Recover] Recovered first frame for shot ${shot.sequence}: ${savedPath}`);
          } else {
            await db.update(shots)
              .set({ firstFramePromptId: null })
              .where(eq(shots.id, shot.id));
            failedCount++;
            console.log(`[Recover] No image found for shot ${shot.sequence} firstFrame, cleared promptId`);
          }
        } catch (err) {
          await db.update(shots)
            .set({ firstFramePromptId: null })
            .where(eq(shots.id, shot.id));
          failedCount++;
          console.warn(`[Recover] Failed to recover first frame for shot ${shot.sequence}:`, err);
        }
      }

      // 恢复尾帧
      if (shot.lastFramePromptId && !shot.lastFrame) {
        try {
          console.log(`[Recover] Checking shot ${shot.sequence} lastFrame with promptId: ${shot.lastFramePromptId}`);
          const savedPath = await fetchComfyUIImageByPromptId(shot.lastFramePromptId);
          if (savedPath) {
            await db.update(shots)
              .set({ lastFrame: savedPath, lastFramePromptId: null })
              .where(eq(shots.id, shot.id));
            recoveredCount++;
            console.log(`[Recover] Recovered last frame for shot ${shot.sequence}: ${savedPath}`);
          } else {
            await db.update(shots)
              .set({ lastFramePromptId: null })
              .where(eq(shots.id, shot.id));
            failedCount++;
            console.log(`[Recover] No image found for shot ${shot.sequence} lastFrame, cleared promptId`);
          }
        } catch (err) {
          await db.update(shots)
            .set({ lastFramePromptId: null })
            .where(eq(shots.id, shot.id));
          failedCount++;
          console.warn(`[Recover] Failed to recover last frame for shot ${shot.sequence}:`, err);
        }
      }
    }

    console.log(`[Recover] Completed: ${recoveredCount} recovered, ${failedCount} failed`);

    return NextResponse.json({
      success: true,
      recovered: recoveredCount,
      failed: failedCount,
      message: `Recovery completed: ${recoveredCount} images recovered, ${failedCount} failed`,
    });
  } catch (error) {
    console.error("[Recover] Error during recovery:", error);
    return NextResponse.json(
      { error: "Recovery failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
