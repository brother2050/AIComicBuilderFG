/**
 * 帧图生成流水线
 * 为每个分镜生成首帧和尾帧
 * 支持 OpenAI (DALL-E) 或 ComfyUI 作为图像生成 Provider
 * 支持强制重新生成（覆盖已有图片）
 * 
 * 分镜连贯性规则：
 * - 第 N 个分镜的首帧 = 第 N-1 个分镜的尾帧（复用，不重新生成）
 * - 只有第 1 个分镜需要独立生成首帧
 * - force 模式下重新生成尾帧时，后续所有分镜的首帧也会更新
 */
import { getImageProvider, getImageProviderType } from "@/lib/ai";
import { db, shots, characters, projects } from "@/lib/db";
import { eq } from "drizzle-orm";
import { buildFirstFramePrompt, buildLastFramePrompt } from "@/lib/prompts/frame-generate";

export interface GenerateFramesOptions {
  /** 强制重新生成，即使已有图片 */
  force?: boolean;
}

export async function generateFrames(
  projectId: string, 
  targetShotId?: string,
  options?: GenerateFramesOptions
): Promise<void> {
  const force = options?.force ?? false;
  console.log(`[Pipeline] Starting frame generation for project: ${projectId}, force: ${force}`);

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) {
    throw new Error("Project not found");
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
    console.log(`[Pipeline] No shots to process`);
    return;
  }

  const imageProvider = getImageProvider();
  const useComfyUI = getImageProviderType() === "comfyui";

  // 用于记录上一分镜的尾帧路径（用于下一分镜的首帧）
  let previousLastFrame: string | undefined;
  // 标记是否需要级联更新后续分镜的首帧
  let cascadeFirstFrame = false;

  const charRefs = projectCharacters.map(c => ({
    name: c.name,
    visualHint: c.visualHint || "",
    referenceImage: c.referenceImage || undefined,
  }));

  const aspectSize = project.aspectRatio === "9:16" ? "720x1280" : 
        project.aspectRatio === "1:1" ? "1024x1024" : "1280x720";

  for (const shot of projectShots) {
    // 检查是否需要处理
    let needFirstFrame = shot.startFrameDesc && (force || !shot.firstFrame);
    let needLastFrame = shot.endFrameDesc && (force || !shot.lastFrame);

    // 如果是级联模式，必须更新首帧（即使已有）
    if (cascadeFirstFrame) {
      needFirstFrame = !!shot.startFrameDesc;
    }

    // 如果既不需要首帧也不需要尾帧，跳过
    if (!needFirstFrame && !needLastFrame) {
      console.log(`[Pipeline] Shot ${shot.sequence}: already has all frames, skipping`);
      continue;
    }

    console.log(`[Pipeline] Shot ${shot.sequence}: generating (first:${needFirstFrame ? 'yes' : 'skip'}, last:${needLastFrame ? 'yes' : 'skip'}, cascade:${cascadeFirstFrame})`);

    // 更新状态
    await db.update(shots)
      .set({ status: "generating" })
      .where(eq(shots.id, shot.id));

    try {
      // 生成首帧
      if (needFirstFrame) {
        const firstFramePath = await generateFirstFrame(
          shot,
          previousLastFrame,
          charRefs,
          project.style || "anime",
          aspectSize,
          imageProvider,
          useComfyUI
        );

        // 首帧生成后立即保存到数据库，让前端能实时看到
        // 如果还需要生成尾帧，设置 partial 状态；否则设置 completed
        const newStatus = needLastFrame ? "partial" : "completed";
        await db.update(shots)
          .set({ 
            firstFrame: firstFramePath, 
            firstFramePromptId: null,
            status: newStatus 
          })
          .where(eq(shots.id, shot.id));

        console.log(`[Pipeline] Shot ${shot.sequence} first frame saved: ${firstFramePath} (status: ${newStatus})`);
      }

      // 生成尾帧
      if (needLastFrame) {
        const lastFramePath = await generateLastFrame(
          shot,
          charRefs,
          project.style || "anime",
          aspectSize,
          imageProvider,
          useComfyUI
        );

        await db.update(shots)
          .set({ 
            lastFrame: lastFramePath,
            lastFramePromptId: null,
            status: "completed",
          })
          .where(eq(shots.id, shot.id));

        // 更新上一分镜尾帧引用，用于下一分镜的首帧
        previousLastFrame = lastFramePath;
        console.log(`[Pipeline] Shot ${shot.sequence} last frame saved: ${lastFramePath}`);

        // 如果重新生成了尾帧，后续所有分镜的首帧都需要更新
        cascadeFirstFrame = true;
      } else if (!needFirstFrame && !cascadeFirstFrame) {
        // 首帧和尾帧都已有且不需要生成，从数据库获取尾帧用于下一分镜
        // 重新读取当前分镜以获取最新的 lastFrame
        const currentShot = await db.query.shots.findFirst({
          where: eq(shots.id, shot.id),
        });
        if (currentShot?.lastFrame) {
          previousLastFrame = currentShot.lastFrame;
        }
      }

      // 如果只是首帧需要更新（级联模式），也标记为完成
      if (needFirstFrame && !needLastFrame && !shot.endFrameDesc) {
        await db.update(shots)
          .set({ status: "completed" })
          .where(eq(shots.id, shot.id));
      }
      
      // 级联模式下首帧生成后，如果是中间分镜（还有尾帧要生成），标记为 partial
      if (cascadeFirstFrame && needFirstFrame && shot.endFrameDesc && !shot.lastFrame) {
        await db.update(shots)
          .set({ status: "partial" })
          .where(eq(shots.id, shot.id));
      }
    } catch (error) {
      console.error(`[Pipeline] Failed to generate frames for shot ${shot.sequence}:`, error);
      await db.update(shots)
        .set({ status: "failed" })
        .where(eq(shots.id, shot.id));
      throw error;
    }
  }

  console.log(`[Pipeline] Frame generation completed`);
}

/**
 * 生成首帧
 * 如果上一分镜有尾帧，直接复用；否则生成新的首帧
 */
async function generateFirstFrame(
  shot: typeof shots.$inferSelect,
  previousLastFrame: string | undefined,
  charRefs: Array<{ name: string; visualHint: string; referenceImage?: string }>,
  style: string,
  aspectSize: string,
  imageProvider: ReturnType<typeof getImageProvider>,
  useComfyUI: boolean
): Promise<string> {
  // 如果上一分镜有尾帧，首帧直接复用
  if (previousLastFrame) {
    console.log(`[Pipeline] Reusing previous shot's last frame as this shot's first frame: ${previousLastFrame}`);
    return previousLastFrame;
  }

  // 否则生成新的首帧
  const firstFramePrompt = buildFirstFramePrompt({
    shotDescription: shot.startFrameDesc!,
    characterReferences: charRefs,
    style,
    previousShotEndFrame: undefined,
  });

  return imageProvider.generateImage(
    firstFramePrompt,
    { size: aspectSize },
    // ComfyUI 模式：保存 promptId 用于恢复
    useComfyUI ? async (promptId: string) => {
      await db.update(shots)
        .set({ firstFramePromptId: promptId })
        .where(eq(shots.id, shot.id));
    } : undefined
  );
}

/**
 * 生成尾帧
 */
async function generateLastFrame(
  shot: typeof shots.$inferSelect,
  charRefs: Array<{ name: string; visualHint: string; referenceImage?: string }>,
  style: string,
  aspectSize: string,
  imageProvider: ReturnType<typeof getImageProvider>,
  useComfyUI: boolean
): Promise<string> {
  const lastFramePrompt = buildLastFramePrompt({
    shotDescription: shot.endFrameDesc!,
    characterReferences: charRefs,
    style,
  });

  return imageProvider.generateImage(
    lastFramePrompt,
    { size: aspectSize },
    // ComfyUI 模式：保存 promptId 用于恢复
    useComfyUI ? async (promptId: string) => {
      await db.update(shots)
        .set({ lastFramePromptId: promptId })
        .where(eq(shots.id, shot.id));
    } : undefined
  );
}
