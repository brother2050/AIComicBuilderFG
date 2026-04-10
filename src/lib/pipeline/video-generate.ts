/**
 * 视频生成流水线（异步模式）
 * 基于首尾帧生成视频
 * 支持项目级自定义工作流
 * 支持强制重新生成
 */
import { getComfyUIVideoProvider } from "@/lib/ai";
import { db, shots, dialogues, characters, projects } from "@/lib/db";
import { eq } from "drizzle-orm";
import { buildVideoPrompt } from "@/lib/prompts/video-generate";
import { isTaskCancelled } from "@/lib/tasks";

export async function generateVideos(
  projectId: string,
  targetShotId?: string,
  options?: { force?: boolean; taskId?: string }
): Promise<void> {
  const force = options?.force ?? false;
  const taskId = options?.taskId;
  console.log(`[Pipeline] Starting video generation for project: ${projectId}, force: ${force}`);

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const projectCharacters = await db.query.characters.findMany({
    where: eq(characters.projectId, projectId),
  });

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

  // 异步模式：先提交所有视频任务
  const pendingVideos: Array<{ shotId: string; promptId: string }> = [];

  for (const shot of projectShots) {
    if (!shot.firstFrame || !shot.lastFrame) {
      console.log(`[Pipeline] Skipping shot ${shot.sequence} - missing frames`);
      continue;
    }

    if (shot.videoUrl && !force) {
      console.log(`[Pipeline] Skipping shot ${shot.sequence} - video already exists`);
      continue;
    }

    console.log(`[Pipeline] Submitting video for shot ${shot.sequence}`);

    await db.update(shots)
      .set({ status: "generating" })
      .where(eq(shots.id, shot.id));

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
      if (videoProvider.submitVideo) {
        // 异步提交
        const result = await videoProvider.submitVideo({
          prompt: videoPrompt,
          firstFrame: shot.firstFrame,
          lastFrame: shot.lastFrame,
          duration: shot.duration || 5,
          ratio: project.aspectRatio || "16:9",
          projectId,
        });
        pendingVideos.push({ shotId: shot.id, promptId: result.promptId });
        console.log(`[Pipeline] Video submitted: ${result.promptId}`);
      } else {
        // 同步模式（备用）
        const result = await videoProvider.generateVideo({
          prompt: videoPrompt,
          firstFrame: shot.firstFrame,
          lastFrame: shot.lastFrame,
          duration: shot.duration || 5,
          ratio: project.aspectRatio || "16:9",
          projectId,
        });
        await db.update(shots)
          .set({ videoUrl: result.filePath, status: "completed" })
          .where(eq(shots.id, shot.id));
        console.log(`[Pipeline] Video saved: ${result.filePath}`);
      }
    } catch (error) {
      console.error(`[Pipeline] Failed to submit video for shot ${shot.sequence}:`, error);
      await db.update(shots)
        .set({ status: "failed" })
        .where(eq(shots.id, shot.id));
      throw error;
    }
  }

  // 异步轮询所有视频任务
  const checkCancelled = taskId ? async () => isTaskCancelled(taskId) : undefined;
  if (videoProvider.pollVideoUntilComplete) {
    for (const task of pendingVideos) {
      const shot = projectShots.find(s => s.id === task.shotId);
      if (!shot) continue;

      try {
        console.log(`[Pipeline] Waiting for video: ${task.promptId}`);
        const filepath = await videoProvider.pollVideoUntilComplete(
          task.promptId,
          {
            prompt: "",
            firstFrame: shot.firstFrame!,
            lastFrame: shot.lastFrame!,
            duration: shot.duration || 5,
            ratio: project.aspectRatio || "16:9",
            projectId,
          },
          { checkCancelled }
        );

        await db.update(shots)
          .set({ videoUrl: filepath, status: "completed" })
          .where(eq(shots.id, task.shotId));
        console.log(`[Pipeline] Video saved: ${filepath}`);
      } catch (e) {
        console.error(`[Pipeline] Video task failed: ${task.promptId}`, e);
        await db.update(shots)
          .set({ status: "failed" })
          .where(eq(shots.id, task.shotId));
        throw e;
      }
    }
  }

  console.log(`[Pipeline] Video generation completed`);
}
