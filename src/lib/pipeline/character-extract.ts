/**
 * 角色提取流水线
 */
import { getOpenAIProvider } from "@/lib/ai";
import { db, characters, projects } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { characterExtractSystemPrompt, buildCharacterExtractPrompt } from "@/lib/prompts/character-extract";

interface CharacterExtractResult {
  characters: Array<{
    name: string;
    scope: "main" | "guest";
    description: string;
    visualHint: string;
  }>;
}

export async function extractCharacters(projectId: string): Promise<CharacterExtractResult> {
  console.log(`[Pipeline] Starting character extraction for project: ${projectId}`);

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project || !project.script) {
    throw new Error("Project not found or no script available");
  }

  const openai = getOpenAIProvider();
  const style = project.style || "anime";

  const prompt = buildCharacterExtractPrompt(project.script, style);
  const response = await openai.generateText(prompt, {
    systemPrompt: characterExtractSystemPrompt,
    temperature: 0.7,
    maxTokens: 8000,
  });

  console.log("[Pipeline] Character extract AI response (first 500 chars):", response.substring(0, 500));

  // 解析JSON响应
  let result: CharacterExtractResult;
  try {
    // 提取 JSON 块或整个 JSON
    const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/) || response.match(/\{[\s\S]*\}/);
    let jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response;

    // 尝试直接解析
    try {
      result = JSON.parse(jsonStr);
    } catch {
      // 如果失败，尝试修复常见问题（未转义的引号）
      console.warn("[Pipeline] Direct JSON parse failed, attempting to fix...");
      // 移除尾部的截断内容
      jsonStr = jsonStr.replace(/[\s\S]*?\{"characters":/, '{"characters":');
      // 尝试找到完整的 JSON 对象
      const lastBrace = jsonStr.lastIndexOf('}');
      if (lastBrace > 0) {
        jsonStr = jsonStr.substring(0, lastBrace + 1);
      }
      // 修复未转义的引号（在字符串值内）
      jsonStr = jsonStr.replace(/"([^"]*)"([^:,\]}]|$)/g, (match, content, next) => {
        if (next && next.trim() === '') return match;
        const fixed = content.replace(/"/g, '\\"');
        return `"${fixed}"${next || ''}`;
      });
      result = JSON.parse(jsonStr);
    }
    console.log("[Pipeline] Parsed characters count:", result.characters?.length);
  } catch (e) {
    console.error("[Pipeline] Failed to parse character JSON:", e);
    console.error("[Pipeline] Raw response:", response.substring(0, 2000));
    throw new Error("Failed to parse character extraction response");
  }

  // 更新或创建角色
  if (result.characters && result.characters.length > 0) {
    for (const char of result.characters) {
      // 查找现有角色
      const existingChar = await db.query.characters.findFirst({
        where: (chars, { and, eq }) => and(
          eq(chars.projectId, projectId),
          eq(chars.name, char.name)
        ),
      });

      if (existingChar) {
        // 更新现有角色
        const descStr = typeof char.description === "object"
          ? JSON.stringify(char.description, null, 2)
          : char.description || existingChar.description;
        await db.update(characters)
          .set({
            description: descStr,
            visualHint: char.visualHint || "",
            scope: char.scope || "guest",
          })
          .where(eq(characters.id, existingChar.id));
        console.log(`[Pipeline] Updated character: ${char.name}`);
      } else {
        // 创建新角色
        const descStr = typeof char.description === "object"
          ? JSON.stringify(char.description, null, 2)
          : char.description || "";
        await db.insert(characters).values({
          id: ulid(),
          projectId,
          name: char.name,
          description: descStr,
          visualHint: char.visualHint || "",
          scope: char.scope || "guest",
        });
        console.log(`[Pipeline] Created character: ${char.name}`);
      }
    }
  }

  console.log(`[Pipeline] Character extraction completed. Processed ${result.characters?.length || 0} characters`);

  return result;
}
