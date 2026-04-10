/**
 * 视频生成流水线
 * 基于首尾帧生成视频
 * 支持项目级自定义工作流
 * 支持强制重新生成
 */
import { getComfyUIVideoProvider } from "@/lib/ai";
import { db, shots, dialogues, characters, projects } from "@/lib/db";
import { eq } from "drizzle-orm";
import { buildVideoPrompt } from "@/lib/prompts/video-generate";

export async function generateVideos(
  projectId: string,
  targetShotId?: string,
  options?: { force?: boolean }
): Promise<void> {
  const force = options?.force ?? false;
  console.log(`[Pipeline] Starting video generation for project: ${projectId}, force: ${force}`);

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) {
    throw new Error("Project not found");
  }

  // 解析项目级自定义工作流（如果存在）
  let customWorkflow: Record<string, unknown> | undefined;
  if (project.videoWorkflow) {
    try {
      customWorkflow = JSON.parse(project.videoWorkflow);
      console.log(`[Pipeline] Using custom workflow for project: ${projectId}`);
    } catch (e) {
      console.warn(`[Pipeline] Failed to parse custom workflow: ${e}`);
    }
  }

  const projectCharacters = await db.query.characters.findMany({
    where: eq(characters.projectId, projectId),
  });

  // 获取目标分镜
  let projectShots;
  if (targetShotId) {
    const shot = await db.query.shots.findFirst({
      where: eq(shots.id, targetShotId),
    });
    projectShots = shot ? [shot] : [];
  } else {
    projectShots = await db.query.shots.findMany({
      where: eq(shots.projectId, projectId),
      orderBy: (s, { asc }) => [asc(s.sequence)],
    });
  }

  if (projectShots.length === 0) {
    throw new Error("No shots found");
  }

  const videoProvider = getComfyUIVideoProvider();

  for (const shot of projectShots) {
    // 只处理已有帧但没有视频的分镜（除非强制重新生成）
    if (!shot.firstFrame || !shot.lastFrame) {
      console.log(`[Pipeline] Skipping shot ${shot.sequence} - missing frames`);
      continue;
    }

    if (shot.videoUrl && !force) {
      console.log(`[Pipeline] Skipping shot ${shot.sequence} - video already exists`);
      continue;
    }

    console.log(`[Pipeline] Generating video for shot ${shot.sequence}`);

    await db.update(shots)
      .set({ status: "generating" })
      .where(eq(shots.id, shot.id));

    // 获取对白
    const shotDialogues = await db.query.dialogues.findMany({
      where: eq(dialogues.shotId, shot.id),
      orderBy: (d, { asc }) => [asc(d.sequence)],
    });

    const videoPrompt = buildVideoPrompt({
      videoScript: shot.videoScript || shot.motionScript || "",
      startFrameDesc: shot.startFrameDesc || "",
      endFrameDesc: shot.endFrameDesc || "",
      duration: shot.duration || 5,
      characters: projectCharacters.map(c => ({
        name: c.name,
        visualHint: c.visualHint || "",
      })),
      dialogues: shotDialogues.map(d => ({
        character: d.characterName,
        text: d.text,
      })),
      cameraDirection: shot.cameraDirection || "static",
    });

    try {
      const result = await videoProvider.generateVideo({
        prompt: videoPrompt,
        firstFrame: shot.firstFrame,
        lastFrame: shot.lastFrame,
        duration: shot.duration || 5,
        ratio: project.aspectRatio || "16:9",
        projectId,
      }, customWorkflow);

      await db.update(shots)
        .set({ 
          videoUrl: result.filePath,
          status: "completed",
        })
        .where(eq(shots.id, shot.id));

      console.log(`[Pipeline] Video saved: ${result.filePath}`);
    } catch (error) {
      console.error(`[Pipeline] Failed to generate video for shot ${shot.sequence}:`, error);
      await db.update(shots)
        .set({ status: "failed" })
        .where(eq(shots.id, shot.id));
    }
  }

  console.log(`[Pipeline] Video generation completed`);
}
