/**
 * 剧本生成 Prompt
 */
import { getStyleNameCN } from "@/lib/utils";

export const scriptGenerateSystemPrompt = `你是一位专业的小说和剧本创作者，擅长创作引人入胜的AI漫剧剧本。

请根据用户提供的想法/创意，创作一个完整的、分镜式的剧本文本。

剧本文本要求：
1. 故事结构完整，有开头、发展、高潮、结局
2. 每个场景都要有具体的分镜描述
3. 对话要符合角色性格，简洁有力
4. 适当描写角色情绪变化
5. 场景切换流畅自然
6. 如果故事较长，可以考虑分2-3集呈现

格式要求：
- 标题：放在最开头，用"标题："标注
- 集数：估算总集数，用"总集数：X集"标注
- 场景描述：用【场景X】或"第X场"标注
- 对白格式：角色名：对白内容（情绪）`;

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

## 要求
1. 故事有清晰的起承转合
2. 每个场景都有具体的分镜描述（包括场景设定、动作描写）
3. 对白简洁有力，符合角色性格
4. 适当标注情绪变化
5. 总时长控制在3-5分钟的视频内容
6. 如果故事较长，可以分2-3集呈现

请直接输出剧本文本，用【场景X】标注每个分镜场景，格式如下：
【场景1】室内/客厅
（小明走进房间，看到桌上的蛋糕）
小明（惊讶）：哇！这是在为我庆祝生日吗？
妈妈（微笑）：生日快乐！我们准备了一个惊喜！

注意：请确保剧本文本足够长且详细，足够支持视频生成。`;
}

export function buildScriptParsePrompt(scriptText: string, episode: number = 1, totalEpisodes: number = 1): string {
  return `请将以下剧本文本解析为JSON格式：

${scriptText}

## 解析要求
- episode: 当前是第 ${episode} 集（共 ${totalEpisodes} 集）
- 只解析与本集相关的内容
- scenes 中的 sequence 从 1 开始编号（跨集连续）
- 每个角色只列出一次（characters 数组）
- 确保JSON格式正确，可以被直接解析

## 输出格式（必须是有效的JSON）
{
  "title": "剧本标题",
  "synopsis": "故事梗概（100字以内）",
  "style": "anime",
  "episode": ${episode},
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
}

请直接输出JSON，不要有其他内容。`;
}
