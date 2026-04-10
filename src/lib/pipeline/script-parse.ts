/**
 * 剧本解析流水线
 */
import { getOpenAIProvider } from "@/lib/ai";
import { db, projects, characters, shots, dialogues } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { scriptParseSystemPrompt, buildScriptParsePrompt } from "@/lib/prompts/script-parse";

interface ScriptParseResult {
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

export async function parseScript(projectId: string): Promise<ScriptParseResult> {
  console.log(`[Pipeline] Starting script parse for project: ${projectId}`);
  
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project || !project.script) {
    throw new Error("Project not found or no script available");
  }

  const openai = getOpenAIProvider();
  
  const prompt = buildScriptParsePrompt(project.script);
  const response = await openai.generateText(prompt, {
    systemPrompt: scriptParseSystemPrompt,
    temperature: 0.7,
    maxTokens: 8000,
    stream: true,
  });

  // 解析JSON响应
  let result: ScriptParseResult;
  try {
    // 尝试提取JSON
    const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/) || response.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response;
    result = JSON.parse(jsonStr);
  } catch (e) {
    console.error("[Pipeline] Failed to parse JSON:", e);
    throw new Error("Failed to parse script response as JSON");
  }

  // 保存解析结果到数据库
  await db.update(projects)
    .set({ 
      title: result.title || project.title,
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

  console.log(`[Pipeline] Script parse completed. Created ${result.characters?.length || 0} characters and ${result.scenes?.length || 0} shots`);

  return result;
}
