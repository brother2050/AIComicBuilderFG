/**
 * 剧本生成流水线
 * 分为两个阶段：1.生成中文文本 2.解析为JSON
 */
import { getOpenAIProvider } from "@/lib/ai";
import { db, projects, characters, shots, dialogues } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { buildScriptGeneratePrompt, buildScriptParsePrompt } from "@/lib/prompts/script-generate";

export interface ScriptTextResult {
  text: string;
  title: string;
  episodeCount: number;
}

export interface ScriptParseResult {
  title: string;
  synopsis: string;
  style: string;
  episode: number;
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

/**
 * 阶段1: 生成中文剧本文本
 */
export async function generateScriptText(
  projectId: string,
  idea: string,
  style: string = "anime"
): Promise<ScriptTextResult> {
  console.log(`[Pipeline] Stage 1: Generating script text for project: ${projectId}`);

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

  console.log(`[Pipeline] Stage 1: Using streaming for text generation`);
  const response = await openai.generateText(prompt, {
    temperature: 0.8,
    maxTokens: 16000,
    stream: true,
  });

  // 提取标题
  let title = project.title || "未命名剧本";
  const titleMatch = response.match(/标题[：:]\s*[""]?([^"""\n]+)[""]?/);
  if (titleMatch) {
    title = titleMatch[1].trim();
  }

  // 估算集数（根据文本长度）
  const episodeCount = Math.ceil(response.length / 2000) || 1;

  // 保存中文文本
  await db.update(projects)
    .set({
      idea: idea,
      title: title,
      scriptText: response,
      totalEpisodes: episodeCount,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  console.log(`[Pipeline] Stage 1: Script text generated. Title: ${title}, Episodes: ${episodeCount}`);

  return {
    text: response,
    title,
    episodeCount,
  };
}

/**
 * 阶段2: 解析中文文本为JSON剧本
 */
export async function parseScriptText(
  projectId: string,
  episode: number = 1
): Promise<ScriptParseResult> {
  console.log(`[Pipeline] Stage 2: Parsing script to JSON for project: ${projectId}, episode: ${episode}`);

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) {
    throw new Error("Project not found");
  }

  if (!project.scriptText) {
    throw new Error("No script text found. Please generate script text first.");
  }

  const openai = getOpenAIProvider();
  const prompt = buildScriptParsePrompt(project.scriptText, episode, project.totalEpisodes || 1);

  console.log(`[Pipeline] Stage 2: Using streaming for JSON parsing`);
  const response = await openai.generateText(prompt, {
    temperature: 0.7,
    maxTokens: 12000,
    stream: true,
  });

  // 解析JSON响应
  let result: ScriptParseResult;
  try {
    // 尝试提取JSON
    const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/) || response.match(/```\n?([\s\S]*?)\n?```/) || response.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response;
    result = JSON.parse(jsonStr);
  } catch (e) {
    console.error("[Pipeline] Stage 2: Failed to parse JSON:", e);
    console.log("[Pipeline] Stage 2: Raw response:", response.slice(0, 500));
    throw new Error("Failed to parse script response as JSON");
  }

  // 清理旧的分集数据（只清理当前集）
  const existingShots = await db.query.shots.findMany({
    where: eq(shots.projectId, projectId),
  });
  for (const shot of existingShots) {
    if (shot.sequence >= (episode - 1) * 100 && shot.sequence < episode * 100) {
      await db.delete(dialogues).where(eq(dialogues.shotId, shot.id));
      await db.delete(shots).where(eq(shots.id, shot.id));
    }
  }

  // 更新项目信息
  await db.update(projects)
    .set({
      title: result.title || project.title,
      script: JSON.stringify(result, null, 2),
      status: "processing",
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  // 保存角色
  const existingChars = await db.query.characters.findMany({
    where: eq(characters.projectId, projectId),
  });
  const existingCharNames = new Set(existingChars.map(c => c.name));

  if (result.characters && result.characters.length > 0) {
    for (const char of result.characters) {
      if (!existingCharNames.has(char.name)) {
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
  }

  // 保存分镜
  const baseSequence = (episode - 1) * 100;
  for (const scene of result.scenes) {
    const shotId = ulid();
    await db.insert(shots).values({
      id: shotId,
      projectId,
      sequence: baseSequence + scene.sequence,
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

  console.log(`[Pipeline] Stage 2: Parsed ${result.scenes?.length || 0} scenes for episode ${episode}`);

  return result;
}

/**
 * 完整剧本生成（两阶段）
 */
export async function generateScript(
  projectId: string,
  idea: string,
  style: string = "anime"
): Promise<{ textResult: ScriptTextResult; parseResult: ScriptParseResult }> {
  console.log(`[Pipeline] Starting full script generation for project: ${projectId}`);

  // 阶段1: 生成中文文本
  const textResult = await generateScriptText(projectId, idea, style);

  // 阶段2: 解析为JSON
  const parseResult = await parseScriptText(projectId, 1);

  return { textResult, parseResult };
}
