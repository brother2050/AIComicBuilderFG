/**
 * 剧本生成 Prompt
 * 根据用户想法/创意生成完整剧本
 */
import { getStyleNameCN } from "@/lib/utils";

export const scriptGenerateSystemPrompt = `你是专业的小说和剧本创作者，擅长创作引人入胜的AI漫剧剧本。

请根据用户提供的想法/创意，生成一个完整的、分镜式的剧本。

剧本要求：
1. 故事结构完整，有开头、发展、高潮、结局
2. 每个场景都要有具体的分镜描述
3. 对话要符合角色性格
4. 适当描写角色情绪变化
5. 场景切换流畅自然

输出格式必须是JSON，结构如下：
{
  "title": "剧本标题",
  "synopsis": "故事梗概（100字以内）",
  "style": "anime",
  "scenes": [
    {
      "sequence": 1,
      "setting": "场景设定（如：现代都市/古代宫殿/外星飞船）",
      "description": "场景整体描述",
      "mood": "氛围（如：紧张/温馨/悬疑/欢乐）",
      "dialogues": [
        {
          "character": "角色名",
          "text": "对白内容",
          "emotion": "情绪（高兴/悲伤/愤怒/惊讶等）"
        }
      ]
    }
  ],
  "characters": [
    {
      "name": "角色名",
      "scope": "main/guest",
      "description": "角色设定描述"
    }
  ]
}`;

export function buildScriptGeneratePrompt(idea: string, style: string = "anime"): string {
  const styleDesc = getStyleNameCN(style);

  return `请根据以下想法创作一个完整的漫剧剧本：

## 创作想法
${idea}

## 风格要求
${styleDesc}${style === "anime" ? "：注重情感表达、视觉冲击、夸张的表情和动作" :
    style === "realistic" ? "：真实细腻、注重细节、光影自然" :
    style === "3d" ? "：立体感强、动作流畅、场景宏大" :
    style === "cartoon" ? "：色彩鲜艳、造型可爱、适合全年龄" : ""}

请确保：
1. 故事有清晰的起承转合
2. 每个场景都有具体的分镜描述
3. 对白简洁有力，符合角色性格
4. 适当标注情绪变化
5. 总时长控制在3-5分钟的视频内容

请直接输出JSON格式的剧本，不要有其他内容。`;
}
