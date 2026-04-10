/**
 * 角色参考图生成流水线（异步模式）
 */
import { getImageProvider, getImageProviderType, ComfyUIImageProvider } from "@/lib/ai";
import { db, characters, projects } from "@/lib/db";
import { eq } from "drizzle-orm";
import { loadProjectWorkflow, getWorkflowDefaults } from "@/lib/ai/providers/workflow-template";
import { isTaskCancelled } from "@/lib/tasks";

// 默认角色图提示词模板
const DEFAULT_CHARACTER_PROMPT = `Character four-view reference sheet — professional character design document.

=== CRITICAL: ART STYLE FIDELITY ===
The CHARACTER DESCRIPTION below is authoritative. It may specify an art style explicitly, implicitly, or through a combination of modifiers.

Rules for interpreting style:
1. Treat the FULL style phrase as one atomic instruction. Do NOT cherry-pick individual words and map them to a default bucket.
2. Style modifiers like "写实 / realistic / 高清 / 精致" describe RENDERING FIDELITY, not medium. They raise detail level within the chosen medium.
3. The medium (2D illustration / 3D CG / photograph / painting / pixel / etc.) is determined ONLY by explicit medium words. In the ABSENCE of such explicit photographic words, DO NOT output a photograph or live-action render.
4. Color palette, lighting mood, and era references in the description are MANDATORY and must be honored exactly.
5. If no style is mentioned at all, infer the most appropriate stylized illustration. Default to stylized illustration, NOT photography.

=== CHARACTER DESCRIPTION (authoritative) ===
Name: {CHARACTER_NAME}
Style: {STYLE}
Visual Description: {DESCRIPTION}

=== FACE — HIGH DETAIL ===
Render the face with precision appropriate to the chosen medium and style:
- Consistent facial bone structure, eye shape, nose, mouth — matching the description exactly
- Eyes expressive and detailed, rendered in the chosen medium's idiom
- Hair with defined volume, color and flow, rendered in the chosen medium's idiom
- The face must be striking, memorable, and instantly recognizable across all four views

=== WEAPONS, COSTUME & EQUIPMENT ===
- All props, armor, clothing and equipment must be rendered in the SAME medium and style as the character
- Material detail must match the style (painterly strokes for paintings, PBR materials for 3D CG, clean flats for anime, etc.)
- Scale and anatomy must be correct relative to the body

=== FOUR-VIEW LAYOUT ===
Four views arranged LEFT to RIGHT on a clean pure white canvas, consistent medium shot (waist to crown) across all four:
1. FRONT — facing viewer directly, showing full outfit and any held items
2. THREE-QUARTER — rotated ~45° right, showing face depth and dimensional form
3. SIDE PROFILE — perfect 90° facing right, clear silhouette
4. BACK — fully facing away, hairstyle and clothing back detail

=== LIGHTING & RENDERING ===
- Clean professional key/fill/rim lighting, consistent direction across all four views
- Pure white background for clean character separation
- Highest quality achievable WITHIN the chosen medium and style

=== CONSISTENCY ACROSS ALL FOUR VIEWS ===
- Identical character identity, proportions and colors in every view
- Identical outfit, accessories, weapon placement, hair
- Heads aligned at the same top edge, waist at the same bottom edge

=== CHARACTER NAME LABEL ===
Display the character's name "{CHARACTER_NAME}" as a clean typographic label below the four-view layout. Use a modern sans-serif font, dark text on white background, centered alignment.

=== FINAL OUTPUT STANDARD ===
Professional character design reference sheet. masterpiece, best quality, highly detailed.`;

export async function generateCharacterImages(
  projectId: string,
  targetCharId?: string,
  options?: { force?: boolean; taskId?: string }
): Promise<void> {
  const force = options?.force ?? false;
  const taskId = options?.taskId;
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

    // 从项目配置读取角色图提示词模板，fallback 到默认值
    const promptTemplate = project.imagePrompt || DEFAULT_CHARACTER_PROMPT;
    const prompt = promptTemplate
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
        // 异步提交，强制使用角色提示词覆盖工作流默认文本
        const result = await comfyProvider.submitImage(prompt, { ...imageParams, forcePrompt: true });
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

        // 检查取消的回调
        const checkCancelled = taskId ? async () => isTaskCancelled(taskId) : undefined;

        const imagePath = await comfyProvider.pollImageUntilComplete(task.promptId, {
          projectId,
          checkCancelled
        });
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
