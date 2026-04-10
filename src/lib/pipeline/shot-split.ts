/**
 * 分镜拆分流水线
 */
import { getOpenAIProvider } from "@/lib/ai";
import { db, shots, dialogues, characters, projects } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { shotSplitSystemPrompt, buildShotSplitPrompt } from "@/lib/prompts/shot-split";

interface ShotSplitResult {
  shots: Array<{
    sequence: number;
    sceneDescription: string;
    startFrame: string;
    endFrame: string;
    motionScript: string;
    videoScript: string;
    duration: number;
    cameraDirection: string;
    dialogues: Array<{
      character: string;
      text: string;
      emotion: string;
    }>;
  }>;
}

export async function splitShots(projectId: string): Promise<ShotSplitResult> {
  console.log(`[Pipeline] Starting shot splitting for project: ${projectId}`);

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project || !project.script) {
    throw new Error("Project not found or no script available");
  }

  const projectCharacters = await db.query.characters.findMany({
    where: eq(characters.projectId, projectId),
  });

  const openai = getOpenAIProvider();

  const prompt = buildShotSplitPrompt(
    project.script,
    projectCharacters.map(c => ({ name: c.name, visualHint: c.visualHint || "" })),
    project.style || "anime"
  );

  const response = await openai.generateText(prompt, {
    systemPrompt: shotSplitSystemPrompt,
    temperature: 0.7,
    maxTokens: 10000,
    stream: true,
  });

  console.log("[Pipeline] Shot split AI response (first 500 chars):", response.substring(0, 500));

  // 解析JSON响应
  let result: ShotSplitResult;
  try {
    const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/) || response.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response;
    result = JSON.parse(jsonStr);
    console.log("[Pipeline] Parsed shots count:", result.shots?.length);
    console.log("[Pipeline] First shot sample:", JSON.stringify(result.shots?.[0])?.substring(0, 500));
  } catch (e) {
    console.error("[Pipeline] Failed to parse shot split JSON:", e);
    console.error("[Pipeline] Raw response:", response.substring(0, 1000));
    throw new Error("Failed to parse shot split response");
  }

  // 删除旧分镜并创建新的
  const existingShots = await db.query.shots.findMany({
    where: eq(shots.projectId, projectId),
  });

  for (const shot of existingShots) {
    await db.delete(dialogues).where(eq(dialogues.shotId, shot.id));
  }
  await db.delete(shots).where(eq(shots.projectId, projectId));

  // 创建新分镜
  for (const shot of result.shots) {
    const shotId = ulid();

    // 如果 AI 没有返回 startFrame/endFrame，从 sceneDescription 派生
    const startFrame = shot.startFrame?.trim() || shot.sceneDescription;
    const endFrame = shot.endFrame?.trim() || shot.sceneDescription;

    if (!shot.startFrame?.trim()) {
      console.warn(`[Pipeline] Shot ${shot.sequence}: startFrame is empty, using sceneDescription`);
    }
    if (!shot.endFrame?.trim()) {
      console.warn(`[Pipeline] Shot ${shot.sequence}: endFrame is empty, using sceneDescription`);
    }

    await db.insert(shots).values({
      id: shotId,
      projectId,
      sequence: shot.sequence,
      sceneDescription: shot.sceneDescription,
      startFrameDesc: startFrame,
      endFrameDesc: endFrame,
      motionScript: shot.motionScript,
      videoScript: shot.videoScript,
      cameraDirection: shot.cameraDirection || "static",
      duration: shot.duration || 10,
      status: "pending",
    });

    // 保存对白
    if (shot.dialogues && shot.dialogues.length > 0) {
      for (let i = 0; i < shot.dialogues.length; i++) {
        const d = shot.dialogues[i];
        // 查找角色ID
        const char = projectCharacters.find(
          c => c.name.toLowerCase() === d.character.toLowerCase()
        );
        await db.insert(dialogues).values({
          id: ulid(),
          shotId,
          characterName: d.character,
          text: d.text,
          emotion: d.emotion || "",
          sequence: i,
        });
      }
    }
  }

  console.log(`[Pipeline] Shot splitting completed. Created ${result.shots?.length || 0} shots`);

  return result;
}
