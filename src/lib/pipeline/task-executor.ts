/**
 * 任务执行器
 * 处理流水线各步骤的执行逻辑
 */
import { db, projects, shots, characters } from "@/lib/db";
import { eq } from "drizzle-orm";
import { updateTaskStatus } from "@/lib/tasks";
import {
  parseScript,
  generateScript,
  extractCharacters,
  generateCharacterImages,
  splitShots,
  generateFrames,
  generateVideos,
  assembleVideo,
} from "@/lib/pipeline";

type GenerateAction =
  | "script_generate"
  | "script_parse"
  | "character_extract"
  | "character_image"
  | "shot_split"
  | "frame_generate"
  | "video_generate"
  | "video_assemble"
  | "full_pipeline";

export async function executeTask(
  taskId: string,
  projectId: string,
  action: GenerateAction,
  options?: { shotId?: string; idea?: string; style?: string; force?: boolean }
): Promise<void> {
  const { shotId, idea, style, force = false } = options || {};
  console.log(`[Task] Starting execution: ${taskId} - ${action}, force: ${force}`);

  try {
    await updateTaskStatus(taskId, "running", 0);

    switch (action) {
      case "script_generate": {
        const payload = { idea, style } as { idea?: string; style?: string };
        await updateTaskStatus(taskId, "running", 10, "正在根据想法生成剧本...");
        const result = await generateScript(projectId, payload.idea!, payload.style);

        const updatedProject = await db.query.projects.findFirst({
          where: eq(projects.id, projectId),
        });
        const chars = await db.query.characters.findMany({
          where: eq(characters.projectId, projectId),
        });
        const newShots = await db.query.shots.findMany({
          where: eq(shots.projectId, projectId),
        });

        await updateTaskStatus(taskId, "completed", 100, "剧本生成完成", undefined, undefined, {
          title: result.title,
          characterCount: result.characters?.length || 0,
          sceneCount: result.scenes?.length || 0,
          characters: chars,
          shots: newShots,
          project: updatedProject,
        });
        break;
      }

      case "script_parse": {
        await updateTaskStatus(taskId, "running", 10, "正在解析剧本...");
        const result = await parseScript(projectId);
        await updateTaskStatus(taskId, "completed", 100, "剧本解析完成", undefined, undefined, {
          title: result.title,
          characterCount: result.characters?.length || 0,
          sceneCount: result.scenes?.length || 0,
        });
        break;
      }

      case "character_extract": {
        await updateTaskStatus(taskId, "running", 20, "正在提取角色...");
        const chars = await extractCharacters(projectId);
        await updateTaskStatus(taskId, "completed", 100, "角色提取完成", undefined, undefined, {
          characters: chars,
        });
        break;
      }

      case "character_image": {
        await updateTaskStatus(taskId, "running", 30, "正在生成角色参考图...");
        await generateCharacterImages(projectId, shotId, { force });
        await updateTaskStatus(taskId, "completed", 100, "角色图生成完成");
        break;
      }

      case "shot_split": {
        await updateTaskStatus(taskId, "running", 40, "正在拆分分镜...");
        const result = await splitShots(projectId);
        await updateTaskStatus(taskId, "completed", 100, "分镜拆分完成", undefined, undefined, {
          shotCount: result?.shots?.length || 0,
        });
        break;
      }

      case "frame_generate": {
        const projectShots = await db.query.shots.findMany({
          where: eq(shots.projectId, projectId),
          orderBy: (s, { asc }) => [asc(s.sequence)],
        });

        const targetShots = shotId
          ? projectShots.filter(s => s.id === shotId)
          : projectShots;

        const total = targetShots.length;

        for (let i = 0; i < targetShots.length; i++) {
          const shot = targetShots[i];

          // 检查是否被取消
          const { isTaskCancelled } = await import("@/lib/tasks");
          if (await isTaskCancelled(taskId)) {
            console.log(`[Task] Task cancelled: ${taskId}`);
            return;
          }

          const progress = Math.round((i / total) * 100);
          await updateTaskStatus(
            taskId,
            "running",
            progress,
            `正在生成第 ${i + 1}/${total} 个分镜帧图...`,
            total,
            i
          );

          await generateFrames(projectId, shot.id, { force });
        }

        await updateTaskStatus(taskId, "completed", 100, "所有帧图生成完成");
        break;
      }

      case "video_generate": {
        const projectShots = await db.query.shots.findMany({
          where: eq(shots.projectId, projectId),
          orderBy: (s, { asc }) => [asc(s.sequence)],
        });

        const targetShots = shotId
          ? projectShots.filter(s => s.id === shotId)
          : projectShots.filter(s => s.firstFrame && s.lastFrame);

        const total = targetShots.length;

        for (let i = 0; i < targetShots.length; i++) {
          const shot = targetShots[i];

          // 检查是否被取消
          const { isTaskCancelled } = await import("@/lib/tasks");
          if (await isTaskCancelled(taskId)) {
            console.log(`[Task] Task cancelled: ${taskId}`);
            return;
          }

          const progress = Math.round((i / total) * 100);
          await updateTaskStatus(
            taskId,
            "running",
            progress,
            `正在生成第 ${i + 1}/${total} 个分镜视频...`,
            total,
            i
          );

          await generateVideos(projectId, shot.id);
        }

        await updateTaskStatus(taskId, "completed", 100, "所有视频生成完成");
        break;
      }

      case "video_assemble": {
        await updateTaskStatus(taskId, "running", 90, "正在合成最终视频...");
        const videoPath = await assembleVideo(projectId);
        await updateTaskStatus(taskId, "completed", 100, "视频合成完成", undefined, undefined, {
          videoUrl: videoPath,
        });
        break;
      }

      case "full_pipeline": {
        await updateTaskStatus(taskId, "running", 5, "步骤 1/7: 解析剧本");
        await parseScript(projectId);

        await updateTaskStatus(taskId, "running", 15, "步骤 2/7: 提取角色");
        await extractCharacters(projectId);

        await updateTaskStatus(taskId, "running", 25, "步骤 3/7: 生成角色参考图");
        await generateCharacterImages(projectId);

        await updateTaskStatus(taskId, "running", 35, "步骤 4/7: 拆分分镜");
        await splitShots(projectId);

        await updateTaskStatus(taskId, "running", 45, "步骤 5/7: 生成帧图");
        await generateFrames(projectId);

        await updateTaskStatus(taskId, "running", 75, "步骤 6/7: 生成视频");
        await generateVideos(projectId);

        await updateTaskStatus(taskId, "running", 90, "步骤 7/7: 合成视频");
        const videoPath = await assembleVideo(projectId);

        await updateTaskStatus(taskId, "completed", 100, "流水线完成", 7, 7, {
          videoUrl: videoPath,
        });
        break;
      }
    }

    console.log(`[Task] Completed: ${taskId}`);
  } catch (error) {
    console.error(`[Task] Failed: ${taskId}`, error);
    await updateTaskStatus(
      taskId,
      "failed",
      0,
      undefined,
      undefined,
      undefined,
      undefined,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}
