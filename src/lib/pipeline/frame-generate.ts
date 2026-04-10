/**
 * 帧图生成流水线（异步模式）
 * 支持 ComfyUI/OpenAI 作为图像生成 Provider
 */
import { getImageProvider, getImageProviderType, ComfyUIImageProvider } from "@/lib/ai";
import { db, shots, characters, projects } from "@/lib/db";
import { eq } from "drizzle-orm";
import { buildFirstFramePrompt, buildLastFramePrompt } from "@/lib/prompts/frame-generate";
import { loadProjectWorkflow, getWorkflowDefaults } from "@/lib/ai/providers/workflow-template";
import { isTaskCancelled } from "@/lib/tasks";

export async function generateFrames(
  projectId: string,
  targetShotId?: string,
  options?: { force?: boolean; taskId?: string }
): Promise<void> {
  const force = options?.force ?? false;
  const taskId = options?.taskId;
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) throw new Error("Project not found");

  const fullWorkflow = loadProjectWorkflow(project.imageWorkflow);

  let projectShots;
  if (targetShotId) {
    const shot = await db.query.shots.findFirst({ where: eq(shots.id, targetShotId) });
    projectShots = shot ? [shot] : [];
  } else {
    projectShots = await db.query.shots.findMany({
      where: eq(shots.projectId, projectId),
      orderBy: (s, { asc }) => [asc(s.sequence)],
    });
  }
  if (projectShots.length === 0) return;

  const imageProvider = getImageProvider();
  const useComfyUI = getImageProviderType() === "comfyui";
  const comfyProvider = imageProvider as ComfyUIImageProvider;
  const charRefs = (await db.query.characters.findMany({ where: eq(characters.projectId, projectId) }))
    .map(c => ({ name: c.name, visualHint: c.visualHint || "", referenceImage: c.referenceImage || undefined }));

  // 从工作流获取默认参数
  const workflowDefaults = fullWorkflow ? getWorkflowDefaults(fullWorkflow) : {
    width: 1024, height: 1024, steps: 8, cfg: 1, denoise: 1, seed: 0,
    sampler_name: "res_multistep", scheduler: "simple", model: "", vae: "", clip: ""
  };
  const aspectSize = `${workflowDefaults.width}x${workflowDefaults.height}`;
  let previousLastFrame: string | undefined;
  let cascadeFirstFrame = false;

  // 构建完整默认参数
  const defaultImageParams = {
    size: aspectSize as "1024x1024",
    steps: workflowDefaults.steps,
    cfg: workflowDefaults.cfg,
    denoise: workflowDefaults.denoise,
    seed: workflowDefaults.seed,
    model: workflowDefaults.model || undefined,
    vae: workflowDefaults.vae || undefined,
    clip: workflowDefaults.clip || undefined,
    projectId
  };

  // 异步模式：先提交所有首帧任务
  const pendingFirstFrames: Array<{ shotId: string; promptId: string }> = [];

  for (const shot of projectShots) {
    let needFirstFrame = shot.startFrameDesc && (force || !shot.firstFrame);
    let needLastFrame = shot.endFrameDesc && (force || !shot.lastFrame);
    if (cascadeFirstFrame) needFirstFrame = !!shot.startFrameDesc;

    if (!needFirstFrame && !needLastFrame) {
      if (shot.lastFrame) previousLastFrame = shot.lastFrame;
      continue;
    }

    await db.update(shots).set({ status: "generating" }).where(eq(shots.id, shot.id));

    try {
      // 生成首帧
      if (needFirstFrame) {
        let framePath: string | null = null;

        if (previousLastFrame) {
          // 使用上一帧作为首帧
          framePath = previousLastFrame;
        } else {
          const prompt = buildFirstFramePrompt({
            shotDescription: shot.startFrameDesc!,
            characterReferences: charRefs,
            style: project.style || "anime"
          });

          if (useComfyUI && comfyProvider.submitImage) {
            const result = await comfyProvider.submitImage(prompt, defaultImageParams);
            await db.update(shots).set({ firstFramePromptId: result.promptId }).where(eq(shots.id, shot.id));
            pendingFirstFrames.push({ shotId: shot.id, promptId: result.promptId });
          } else {
            framePath = await imageProvider.generateImage(prompt, defaultImageParams);
            await db.update(shots).set({ firstFrame: framePath, status: needLastFrame ? "partial" : "completed" }).where(eq(shots.id, shot.id));
          }
        }

        if (framePath) {
          const newStatus = needLastFrame ? "partial" : "completed";
          await db.update(shots).set({ firstFrame: framePath, firstFramePromptId: null, status: newStatus }).where(eq(shots.id, shot.id));
        }
      }

      // 尾帧暂不提交，等待首帧完成
      if (!needLastFrame && shot.lastFrame) {
        previousLastFrame = shot.lastFrame;
      }
    } catch (error) {
      console.error(`[Pipeline] Shot ${shot.sequence} first frame failed:`, error);
      await db.update(shots).set({ status: "failed" }).where(eq(shots.id, shot.id));
      throw error;
    }
  }

  // 等待首帧完成并处理尾帧
  const checkCancelled = taskId ? async () => isTaskCancelled(taskId) : undefined;
  if (useComfyUI && comfyProvider.pollImageUntilComplete) {
    for (const task of pendingFirstFrames) {
      try {
        const imagePath = await comfyProvider.pollImageUntilComplete(task.promptId, { projectId, checkCancelled });
        await db.update(shots).set({ firstFrame: imagePath, firstFramePromptId: null }).where(eq(shots.id, task.shotId));
        console.log(`[Pipeline] First frame saved: ${imagePath}`);
      } catch (e) {
        console.error(`[Pipeline] First frame task failed: ${task.promptId}`, e);
        await db.update(shots).set({ firstFramePromptId: null, status: "failed" }).where(eq(shots.id, task.shotId));
        throw e;
      }
    }
  }

  // 现在处理尾帧
  const pendingLastFrames: Array<{ shotId: string; promptId: string }> = [];

  for (const shot of projectShots) {
    let needLastFrame = shot.endFrameDesc && (force || !shot.lastFrame);
    if (!needLastFrame) continue;

    try {
      const prompt = buildLastFramePrompt({
        shotDescription: shot.endFrameDesc!,
        characterReferences: charRefs,
        style: project.style || "anime"
      });

      if (useComfyUI && comfyProvider.submitImage) {
        const result = await comfyProvider.submitImage(prompt, defaultImageParams);
        await db.update(shots).set({ lastFramePromptId: result.promptId }).where(eq(shots.id, shot.id));
        pendingLastFrames.push({ shotId: shot.id, promptId: result.promptId });
      } else {
        const imagePath = await imageProvider.generateImage(prompt, defaultImageParams);
        await db.update(shots).set({ lastFrame: imagePath, status: "completed" }).where(eq(shots.id, shot.id));
        console.log(`[Pipeline] Last frame saved: ${imagePath}`);
      }
    } catch (error) {
      console.error(`[Pipeline] Shot ${shot.sequence} last frame failed:`, error);
      await db.update(shots).set({ status: "failed" }).where(eq(shots.id, shot.id));
      throw error;
    }
  }

  // 等待尾帧完成
  if (useComfyUI && comfyProvider.pollImageUntilComplete) {
    for (const task of pendingLastFrames) {
      try {
        const imagePath = await comfyProvider.pollImageUntilComplete(task.promptId, { projectId, checkCancelled });
        await db.update(shots).set({ lastFrame: imagePath, lastFramePromptId: null, status: "completed" }).where(eq(shots.id, task.shotId));
        console.log(`[Pipeline] Last frame saved: ${imagePath}`);
      } catch (e) {
        console.error(`[Pipeline] Last frame task failed: ${task.promptId}`, e);
        await db.update(shots).set({ lastFramePromptId: null, status: "failed" }).where(eq(shots.id, task.shotId));
        throw e;
      }
    }
  }
}
