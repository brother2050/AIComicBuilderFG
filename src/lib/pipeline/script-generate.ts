/**
 * 剧本生成流水线
 * 根据用户想法/创意生成完整剧本
 */
import { getOpenAIProvider } from "@/lib/ai";
import { db, projects, characters, shots, dialogues } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { scriptGenerateSystemPrompt, buildScriptGeneratePrompt } from "@/lib/prompts/script-generate";

interface ScriptGenerateResult {
  title: string;
  synopsis: string;
  style: string;
  scenes: Array<{
    sequence: number;
    setting: string;
    description: string;
    mood: string;
    dialogues: Array<{
      character: string;
      text: string;
      emotion: string;
    }>;
  }>;
  characters: Array<{
    name: string;
    scope: string;
    description: string;
  }>;
}

export async function generateScript(
  projectId: string, 
  idea: string,
  style: string = "anime"
): Promise<ScriptGenerateResult> {
  console.log(`[Pipeline] Starting script generation for project: ${projectId}`);
  
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) {
    throw new Error("Project not found");
  }

  if (!idea) {
    throw new Error("Idea is required for script generation");
  }

  const openai = getOpenAIProvider();
  
  const prompt = buildScriptGeneratePrompt(idea, style || project.style || "anime");
  const response = await openai.generateText(prompt, {
    systemPrompt: scriptGenerateSystemPrompt,
    temperature: 0.8,
    maxTokens: 12000,
  });

  // 解析JSON响应
  let result: ScriptGenerateResult;
  try {
    // 尝试提取JSON
    const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/) || response.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response;
    result = JSON.parse(jsonStr);
  } catch (e) {
    console.error("[Pipeline] Failed to parse JSON:", e);
    throw new Error("Failed to parse script response as JSON");
  }

  // 清理旧数据
  const existingShots = await db.query.shots.findMany({
    where: eq(shots.projectId, projectId),
  });
  for (const shot of existingShots) {
    await db.delete(dialogues).where(eq(dialogues.shotId, shot.id));
  }
  await db.delete(shots).where(eq(shots.projectId, projectId));
  await db.delete(characters).where(eq(characters.projectId, projectId));

  // 保存剧本
  const scriptText = JSON.stringify(result, null, 2);
  await db.update(projects)
    .set({ 
      title: result.title || project.title,
      idea: idea,
      script: scriptText,
      style: result.style || style,
      status: "processing",
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  // 保存角色
  if (result.characters && result.characters.length > 0) {
    for (const char of result.characters) {
      await db.insert(characters).values({
        id: ulid(),
        projectId,
        name: char.name,
        description: char.description || "",
        visualHint: "",
        scope: (char.scope as "main" | "guest") || "main",
      });
    }
  }

  // 保存分镜
  for (const scene of result.scenes) {
    const shotId = ulid();
    await db.insert(shots).values({
      id: shotId,
      projectId,
      sequence: scene.sequence,
      sceneDescription: `${scene.setting}\n${scene.description}`,
      cameraDirection: "static",
      duration: 10,
      status: "pending",
    });

    // 保存对白
    if (scene.dialogues && scene.dialogues.length > 0) {
      for (let i = 0; i < scene.dialogues.length; i++) {
        const d = scene.dialogues[i];
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

  console.log(`[Pipeline] Script generation completed. Created ${result.characters?.length || 0} characters and ${result.scenes?.length || 0} scenes`);

  return result;
}
