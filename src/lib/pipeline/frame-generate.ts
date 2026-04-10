/**
 * 帧图生成流水线（异步模式）
 * 参考 twwch/AIComicBuilder 的首尾帧处理逻辑
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

  // 获取项目角色列表
  const projectCharacters = await db.query.characters.findMany({
    where: eq(characters.projectId, projectId),
  });

  // 构建角色描述（参考 twwch/AIComicBuilder）
  const characterDescParts: string[] = [];
  for (const c of projectCharacters) {
    const desc = `${c.name}: ${c.visualDescription || c.description || ""}`;
    characterDescParts.push(desc);
  }
  const characterDescriptions = characterDescParts.join("\n");

  // 从工作流获取默认参数
  const workflowDefaults = fullWorkflow ? getWorkflowDefaults(fullWorkflow) : {
    width: 1024, height: 1024, steps: 8, cfg: 1, denoise: 1, seed: 0,
    sampler_name: "res_multistep", scheduler: "simple", model: "", vae: "", clip: ""
  };
  const aspectSize = `${workflowDefaults.width}x${workflowDefaults.height}`;

  // 构建默认图片参数
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

  const checkCancelled = taskId ? async () => isTaskCancelled(taskId) : undefined;

  // 逐个镜头处理（参考 twwch/AIComicBuilder 的串行处理方式）
  for (let i = 0; i < projectShots.length; i++) {
    const shot = projectShots[i];

    // 检查是否被取消
    if (checkCancelled) {
      const cancelled = await checkCancelled();
      if (cancelled) {
        console.log(`[FrameGenerate] Task cancelled, stopping at shot ${shot.sequence}`);
        return;
      }
    }

    const needFirstFrame = shot.startFrameDesc && (force || !shot.firstFrame);
    const needLastFrame = shot.endFrameDesc && (force || !shot.lastFrame);

    if (!needFirstFrame && !needLastFrame) {
      console.log(`[FrameGenerate] Shot ${shot.sequence}: skipping (already has frames)`);
      continue;
    }

    await db.update(shots).set({ status: "generating" }).where(eq(shots.id, shot.id));

    try {
      // 获取上一个镜头的尾帧（用于连续性提示）
      let previousLastFrame: string | undefined;
      if (i > 0) {
        const prevShot = projectShots[i - 1];
        if (prevShot.lastFrame) {
          previousLastFrame = prevShot.lastFrame;
        }
      }

      let firstFramePath: string | null = null;

      // 生成首帧
      if (needFirstFrame) {
        console.log(`[FrameGenerate] Shot ${shot.sequence}: generating first frame`);

        const firstFramePrompt = buildFirstFramePrompt({
          sceneDescription: shot.sceneDescription || "",
          startFrameDesc: shot.startFrameDesc!,
          characterDescriptions,
          style: project.style || "anime",
          previousLastFrame,
        });

        if (useComfyUI && comfyProvider.submitImage) {
          const result = await comfyProvider.submitImage(firstFramePrompt, defaultImageParams);
          await db.update(shots).set({ firstFramePromptId: result.promptId }).where(eq(shots.id, shot.id));
          firstFramePath = await comfyProvider.pollImageUntilComplete(result.promptId, { projectId, checkCancelled });
        } else {
          firstFramePath = await imageProvider.generateImage(firstFramePrompt, defaultImageParams);
        }

        await db.update(shots)
          .set({ firstFrame: firstFramePath, firstFramePromptId: null })
          .where(eq(shots.id, shot.id));
        console.log(`[FrameGenerate] Shot ${shot.sequence}: first frame saved: ${firstFramePath}`);
      } else if (shot.firstFrame) {
        // 使用已有的首帧
        firstFramePath = shot.firstFrame;
      }

      // 生成尾帧（使用图生图工作流，基于首帧编辑）
      if (needLastFrame && firstFramePath) {
        console.log(`[FrameGenerate] Shot ${shot.sequence}: generating last frame (image edit mode)`);

        const lastFramePrompt = buildLastFramePrompt({
          sceneDescription: shot.sceneDescription || "",
          endFrameDesc: shot.endFrameDesc!,
          characterDescriptions,
          style: project.style || "anime",
          firstFramePath,
        });

        let lastFramePath: string | null = null;

        if (useComfyUI && comfyProvider.submitImageEdit) {
          // 使用图生图工作流（image_qwen_image_edit_2509.json）
          const result = await comfyProvider.submitImageEdit(lastFramePrompt, firstFramePath, { projectId });
          await db.update(shots).set({ lastFramePromptId: result.promptId }).where(eq(shots.id, shot.id));
          lastFramePath = await comfyProvider.pollImageUntilComplete(result.promptId, { projectId, checkCancelled, useImageEditApi: true });
        } else if (useComfyUI && comfyProvider.submitImage) {
          // 回退到普通图片生成
          const result = await comfyProvider.submitImage(lastFramePrompt, defaultImageParams);
          await db.update(shots).set({ lastFramePromptId: result.promptId }).where(eq(shots.id, shot.id));
          lastFramePath = await comfyProvider.pollImageUntilComplete(result.promptId, { projectId, checkCancelled });
        } else {
          lastFramePath = await imageProvider.generateImage(lastFramePrompt, defaultImageParams);
        }

        await db.update(shots)
          .set({ lastFrame: lastFramePath, lastFramePromptId: null, status: "completed" })
          .where(eq(shots.id, shot.id));
        console.log(`[FrameGenerate] Shot ${shot.sequence}: last frame saved: ${lastFramePath}`);
      } else if (shot.lastFrame) {
        // 已有尾帧，只更新状态
        await db.update(shots).set({ status: "completed" }).where(eq(shots.id, shot.id));
      }
    } catch (error) {
      console.error(`[FrameGenerate] Shot ${shot.sequence} failed:`, error);
      await db.update(shots).set({ status: "failed" }).where(eq(shots.id, shot.id));
      throw error;
    }
  }

  console.log(`[FrameGenerate] All frames generated for project: ${projectId}`);
}
