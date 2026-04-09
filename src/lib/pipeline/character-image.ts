/**
 * 角色参考图生成流水线
 * 支持 OpenAI (DALL-E) 或 ComfyUI 作为图像生成 Provider
 * 支持强制重新生成（覆盖已有图片）
 */
import { getImageProvider, getImageProviderType } from "@/lib/ai";
import { db, characters, projects } from "@/lib/db";
import { eq } from "drizzle-orm";
import { characterFourViewPrompt } from "@/lib/prompts/frame-generate";

export interface GenerateCharacterImagesOptions {
  /** 强制重新生成，即使已有图片 */
  force?: boolean;
}

export async function generateCharacterImages(
  projectId: string,
  targetCharId?: string,
  options?: GenerateCharacterImagesOptions
): Promise<void> {
  const force = options?.force ?? false;
  console.log(`[Pipeline] Starting character image generation for project: ${projectId}${targetCharId ? `, target: ${targetCharId}` : ""}, force: ${force}`);

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) {
    throw new Error("Project not found");
  }

  // 获取角色列表（支持单个或全部）
  let projectCharacters;
  if (targetCharId) {
    const char = await db.query.characters.findFirst({
      where: eq(characters.id, targetCharId),
    });
    projectCharacters = char ? [char] : [];
  } else {
    projectCharacters = await db.query.characters.findMany({
      where: eq(characters.projectId, projectId),
    });
  }

  if (projectCharacters.length === 0) {
    console.log(`[Pipeline] No characters to process`);
    return;
  }

  const imageProvider = getImageProvider();

  for (const char of projectCharacters) {
    if (!char.description) {
      console.warn(`[Pipeline] Character ${char.name} has no description, skipping`);
      continue;
    }

    // 如果不是强制模式且已有图片，跳过
    if (!force && char.referenceImage) {
      console.log(`[Pipeline] Character ${char.name} already has image, skipping`);
      continue;
    }

    console.log(`[Pipeline] Generating image for character: ${char.name}${force ? ' (forced)' : ''}`);

    const prompt = characterFourViewPrompt
      .replace("{STYLE}", project.style || "anime")
      .replace("{CHARACTER_NAME}", char.name)
      .replace("{DESCRIPTION}", char.description);

    try {
      const imagePath = await imageProvider.generateImage(
        prompt,
        { size: "1024x1024" },
        // ComfyUI 模式：保存 promptId 用于恢复
        getImageProviderType() === "comfyui" 
          ? async (promptId: string) => {
              await db.update(characters)
                .set({ comfyuiPromptId: promptId })
                .where(eq(characters.id, char.id));
            }
          : undefined
      );

      // 更新角色参考图
      await db.update(characters)
        .set({ referenceImage: imagePath, comfyuiPromptId: null })
        .where(eq(characters.id, char.id));

      console.log(`[Pipeline] Character image saved: ${imagePath}`);
    } catch (error) {
      console.error(`[Pipeline] Failed to generate image for ${char.name}:`, error);
      throw error; // 单个生成失败时抛出错误
    }
  }

  console.log(`[Pipeline] Character image generation completed`);
}
