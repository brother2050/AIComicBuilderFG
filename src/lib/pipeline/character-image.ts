/**
 * 角色参考图生成流水线
 * 支持 OpenAI (DALL-E) 或 ComfyUI 作为图像生成 Provider
 * 支持强制重新生成（覆盖已有图片）
 * 支持项目级自定义工作流
 */
import { getImageProvider, getImageProviderType, ComfyUIImageProvider } from "@/lib/ai";
import { db, characters, projects } from "@/lib/db";
import { eq } from "drizzle-orm";
import { characterFourViewPrompt } from "@/lib/prompts/frame-generate";
import { loadWorkflowTemplate } from "@/lib/ai/providers/workflow-template";

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

  // 解析项目级图片工作流（如果存在）
  // 可能是完整工作流对象，也可能是配置引用 { _workflowFile, _width, _height, _steps }
  let fullWorkflow: Record<string, unknown> | undefined;
  if (project.imageWorkflow) {
    try {
      const imageWorkflowConfig = JSON.parse(project.imageWorkflow) as Record<string, unknown>;
      console.log(`[Pipeline] Using custom image workflow for project: ${projectId}`);
      
      // 如果是配置引用（包含 _workflowFile），需要加载实际模板
      if (imageWorkflowConfig._workflowFile) {
        const templateFile = String(imageWorkflowConfig._workflowFile);
        const template = loadWorkflowTemplate(templateFile);
        if (template) {
          // 检测是否是子图格式（包含 definitions.subgraphs）
          // 子图格式不支持 API，需要回退到标准模板
          const templateDefinitions = template.definitions as Record<string, unknown> | undefined;
          if (templateDefinitions?.subgraphs) {
            // 子图格式不支持 API，尝试加载对应的 _api.json 版本
            const apiVersion = templateFile.replace('.json', '_api.json');
            console.warn(`[Pipeline] Template ${templateFile} uses subgraph format, trying API version: ${apiVersion}`);
            const apiTemplate = loadWorkflowTemplate(apiVersion);
            if (apiTemplate) {
              fullWorkflow = {
                ...apiTemplate,
                _config: {
                  width: Number(imageWorkflowConfig._width) || 1024,
                  height: Number(imageWorkflowConfig._height) || 1024,
                  steps: Number(imageWorkflowConfig._steps) || 8,
                  model: imageWorkflowConfig._model as string || undefined,
                }
              };
              console.log(`[Pipeline] Using API workflow template: ${apiVersion}`);
            } else {
              console.warn(`[Pipeline] No API version found, falling back to standard_sd15.json`);
              const fallbackTemplate = loadWorkflowTemplate('standard_sd15.json');
              if (fallbackTemplate) {
                fullWorkflow = {
                  ...fallbackTemplate,
                  _config: {
                    width: Number(imageWorkflowConfig._width) || 1024,
                    height: Number(imageWorkflowConfig._height) || 1024,
                    steps: Number(imageWorkflowConfig._steps) || 8,
                    model: imageWorkflowConfig._model as string || undefined,
                  }
                };
                console.log(`[Pipeline] Using fallback workflow template: standard_sd15.json`);
              }
            }
          } else {
            // 保存配置参数到工作流中，供 generateImageWithWorkflow 使用
            fullWorkflow = {
              ...template,
              _config: {
                width: Number(imageWorkflowConfig._width) || 1024,
                height: Number(imageWorkflowConfig._height) || 1024,
                steps: Number(imageWorkflowConfig._steps) || 8,
                model: imageWorkflowConfig._model as string || undefined,
              }
            };
            console.log(`[Pipeline] Loaded workflow template: ${templateFile}`);
          }
        } else {
          console.warn(`[Pipeline] Failed to load workflow template: ${templateFile}`);
        }
      } else {
        // 如果是完整工作流对象，直接使用
        fullWorkflow = imageWorkflowConfig;
      }
    } catch (e) {
      console.warn(`[Pipeline] Failed to parse custom image workflow: ${e}`);
    }
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
  const useComfyUI = getImageProviderType() === "comfyui";

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

    // 图片生成参数（只包含 ImageOptions 定义的字段）
    const imageParams = {
      size: "1024x1024" as const,
      steps: 8,
      cfg: 8.0,
      denoise: 1.0,
    };

    // 完整参数信息（用于日志）
    const fullParams = {
      ...imageParams,
      style: project.style || "anime",
      hasCustomWorkflow: !!fullWorkflow,
      workflowFile: fullWorkflow ? (fullWorkflow._config as Record<string, unknown>)?.model || 'custom' : 'default',
    };

    console.log(`[Pipeline Character Image] Generation params:`, {
      characterId: char.id,
      characterName: char.name,
      projectId: projectId,
      provider: useComfyUI ? 'ComfyUI' : 'OpenAI',
      fullParams,
      promptLength: prompt.length,
    });

    try {
      let imagePath: string;

      // 如果有完整工作流且使用 ComfyUI
      if (fullWorkflow && useComfyUI) {
        const comfyProvider = imageProvider as ComfyUIImageProvider;
        if (comfyProvider.generateImageWithWorkflow) {
          console.log(`[Pipeline] Generating character image with custom workflow`);
          // 使用更高分辨率和专业参数生成角色参考图
          imagePath = await comfyProvider.generateImageWithWorkflow(
            prompt,
            fullWorkflow,
            imageParams,
            async (promptId: string) => {
              await db.update(characters)
                .set({ comfyuiPromptId: promptId })
                .where(eq(characters.id, char.id));
            }
          );
        } else {
          // fallback to regular generateImage
          imagePath = await imageProvider.generateImage(
            prompt,
            { ...imageParams, customWorkflow: fullWorkflow },
            async (promptId: string) => {
              await db.update(characters)
                .set({ comfyuiPromptId: promptId })
                .where(eq(characters.id, char.id));
            }
          );
        }
      } else {
        imagePath = await imageProvider.generateImage(
          prompt,
          imageParams,
          // ComfyUI 模式：保存 promptId 用于恢复
          useComfyUI 
            ? async (promptId: string) => {
                await db.update(characters)
                  .set({ comfyuiPromptId: promptId })
                  .where(eq(characters.id, char.id));
              }
            : undefined
        );
      }

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
