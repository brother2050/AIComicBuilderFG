/**
 * 角色参考图生成流水线（异步模式）
 */
import { getImageProvider, getImageProviderType, ComfyUIImageProvider } from "@/lib/ai";
import { db, characters, projects } from "@/lib/db";
import { eq } from "drizzle-orm";
import { characterFourViewPrompt } from "@/lib/prompts/frame-generate";
import { loadProjectWorkflow, getWorkflowDefaults } from "@/lib/ai/providers/workflow-template";

export async function generateCharacterImages(
  projectId: string,
  targetCharId?: string,
  options?: { force?: boolean }
): Promise<void> {
  const force = options?.force ?? false;
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) throw new Error("Project not found");

  const fullWorkflow = loadProjectWorkflow(project.imageWorkflow);
  const imageProvider = getImageProvider();
  const useComfyUI = getImageProviderType() === "comfyui";
  const comfyProvider = imageProvider as ComfyUIImageProvider;

  // 从工作流获取默认参数
  const workflowDefaults = fullWorkflow ? getWorkflowDefaults(fullWorkflow) : {
    width: 1024, height: 1024, steps: 8, cfg: 1, denoise: 1, seed: 0,
    sampler_name: "res_multistep", scheduler: "simple", model: "", vae: "", clip: ""
  };

  let chars;
  if (targetCharId) {
    const char = await db.query.characters.findFirst({ where: eq(characters.id, targetCharId) });
    chars = char ? [char] : [];
  } else {
    chars = await db.query.characters.findMany({ where: eq(characters.projectId, projectId) });
  }

  // 异步模式：先提交所有任务
  const pendingTasks: Array<{ charId: string; promptId: string }> = [];

  for (const char of chars) {
    const visualDesc = char.visualDescription || char.description;
    if (!visualDesc) continue;
    if (!force && char.referenceImage) continue;

    const prompt = characterFourViewPrompt
      .replace("{STYLE}", project.style || "anime")
      .replace("{CHARACTER_NAME}", char.name)
      .replace("{DESCRIPTION}", visualDesc);

    // 使用工作流模板的完整默认值
    const size = `${workflowDefaults.width}x${workflowDefaults.height}`;
    const imageParams = {
      size: size as "1024x1024",
      steps: workflowDefaults.steps,
      cfg: workflowDefaults.cfg,
      denoise: workflowDefaults.denoise,
      seed: workflowDefaults.seed,
      model: workflowDefaults.model || undefined,
      vae: workflowDefaults.vae || undefined,
      clip: workflowDefaults.clip || undefined,
      projectId
    };

    try {
      if (useComfyUI && comfyProvider.submitImage) {
        // 异步提交
        const result = await comfyProvider.submitImage(prompt, imageParams);
        await db.update(characters)
          .set({ comfyuiPromptId: result.promptId })
          .where(eq(characters.id, char.id));
        pendingTasks.push({ charId: char.id, promptId: result.promptId });
        console.log(`[Pipeline] Character ${char.name} submitted: ${result.promptId}`);
      } else {
        // 同步模式（OpenAI DALL-E）
        const imagePath = await imageProvider.generateImage(prompt, imageParams);
        await db.update(characters).set({ referenceImage: imagePath }).where(eq(characters.id, char.id));
        console.log(`[Pipeline] Character ${char.name} image saved: ${imagePath}`);
      }
    } catch (e) {
      console.error(`[Pipeline] Failed to submit character ${char.name}:`, e);
      throw e;
    }
  }

  // 异步轮询所有任务
  if (useComfyUI && comfyProvider.pollImageUntilComplete) {
    for (const task of pendingTasks) {
      try {
        console.log(`[Pipeline] Waiting for character task: ${task.promptId}`);
        const imagePath = await comfyProvider.pollImageUntilComplete(task.promptId, { projectId });
        await db.update(characters)
          .set({ referenceImage: imagePath, comfyuiPromptId: null })
          .where(eq(characters.id, task.charId));
        console.log(`[Pipeline] Character image saved: ${imagePath}`);
      } catch (e) {
        console.error(`[Pipeline] Character task failed: ${task.promptId}`, e);
        await db.update(characters)
          .set({ comfyuiPromptId: null })
          .where(eq(characters.id, task.charId));
        throw e;
      }
    }
  }
}
