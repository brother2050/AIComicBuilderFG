/**
 * 角色描述 Prompt 模板
 * 用于从剧本中提取角色并生成专业的视觉描述
 */

/**
 * 默认角色描述模板 - 剧情描述
 * 用于从剧本中提取角色的背景、性格、作用等信息
 */
export const DEFAULT_CHARACTER_DESCRIPTION_TEMPLATE = `You are a story analyst specializing in Chinese drama and animation scripts.

## YOUR TASK
Extract character information from the script to create:
1. Character background and role in the story
2. Personality traits shown through dialogue
3. Relationships with other characters

## OUTPUT FORMAT (STRICT JSON - NO MARKDOWN, NO CODE BLOCKS)
{
  "characters": [
    {
      "name": "Character Name (角色名称)",
      "scope": "main (主角) or guest (配角)",
      "description": "Character's background, personality, role in story, and key traits (100-200 words, in Chinese)"
    }
  ]
}

## ANALYSIS REQUIREMENTS
1. Analyze the character's dialogue to understand their personality
2. Identify their role in the story (protagonist, mentor, villain, etc.)
3. Note any special characteristics or backstory hints
4. For traditional characters like Sun Wukong, use classic interpretations

## EXAMPLE

Input: A scene where Sun Wukong confronts Buddha
Output: {
  "characters": [
    {
      "name": "孙悟空",
      "scope": "main",
      "description": "齐天大圣，孙悟空是唐僧的大徒弟，拥有七十二变和筋斗云等神通。他性格刚烈不屈，重情重义，对师父忠心耿耿。面对强敌时英勇无畏，但也有急躁冲动的一面。他手持如意金箍棒，身披锁子黄金甲，头戴凤翅紫金冠，是经典的美猴王形象。"
    },
    {
      "name": "如来",
      "scope": "main",
      "description": "佛祖，佛教的最高领袖。如来佛祖慈悲为怀，神通广大，能够洞察一切。他说话温和却充满智慧，常常用循循善诱的方式引导迷途之人。端坐于莲台之上，周身散发金色佛光，给人以威严而慈祥的感觉。"
    }
  ]
}

## CRITICAL RULES
1. description should be in Chinese
2. Focus on story elements, NOT visual appearance
3. Return ONLY the JSON object - no explanations, no markdown
4. Each character description must be self-contained`;

export interface CharacterDescriptionTemplate {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 视觉描述系统提示词
 */
const VISUAL_DESCRIPTION_SYSTEM_PROMPT = `You are a PROFESSIONAL Character Designer & Visual Artist with 20+ years of experience in concept art, anime, and cinematic illustration.

## YOUR TASK
Create detailed, production-ready visual descriptions for AI image generation (ComfyUI/SD3).

## OUTPUT FORMAT (STRICT JSON - NO MARKDOWN, NO CODE BLOCKS)
{
  "characters": [
    {
      "name": "Character Name",
      "visualDescription": "Detailed visual description in English (150-250 words)",
      "visualHint": "3-5 word image search hint"
    }
  ]
}

## VISUAL DESCRIPTION STRUCTURE (Follow this exact format)

### 1. POSE & COMPOSITION
- Character stance and body positioning
- Point of view (POV): front-facing, 3/4 view, profile, dynamic action pose
- Framing: bust, waist-up, full body, close-up portrait

### 2. PHYSICAL APPEARANCE
- Age, gender presentation, body type (athletic, slim, muscular, etc.)
- Face: distinctive features, expression, skin tone, unique marks/scars
- Hair: style, color (use hex codes), length, highlights, accessories
- Eyes: color (hex), shape, special features (glowing, heterochromia, etc.)

### 3. COSTUME & PROPS
- Main outfit with fabric type and texture
- Color palette with hex codes (e.g., #1a1a2e for dark navy)
- Armor/weapons/cloaks with material details
- Accessories: jewelry, headwear, gloves, boots
- Key props held or carried

### 4. LIGHTING & ATMOSPHERE
- Lighting setup: rim light, softbox, dramatic chiaroscuro, natural sunlight
- Color temperature: warm (3200K), cool (6500K), cinematic teal-orange

### 5. ART STYLE REFERENCE
- Style: anime cel-shading, illustration, concept art, photorealistic, 3D render
- Quality tags: masterpiece, best quality, highly detailed, intricate, 8k

## EXAMPLES

### Sun Wukong (孙悟空):
{
  "name": "孙悟空",
  "visualDescription": "A legendary Monkey King with a powerful athletic build. Standing in a heroic combat stance. He has a distinctive monkey face with sharp features, glowing golden eyes showing determination. Long flowing black hair with auburn highlights tied in a high ponytail with golden ornaments. Wearing iconic golden锁子甲 (scale armor) with red undergarments, crimson cape billowing dramatically. Armed with the massive Ruyi Golden Cudgel (如意金箍棒) held firmly. Head adorned with Phoenix Feather Crown (凤翅紫金冠). Dramatic golden rim lighting creates a heroic silhouette. Anime cel-shading style with bold outlines and vibrant colors. masterpiece, best quality, highly detailed anime art.",
  "visualHint": "monkey king warrior"
}

### Buddha (如来):
{
  "name": "如来",
  "visualDescription": "An ancient Buddha with a serene, ageless face radiating inner peace. Seated cross-legged on a magnificent golden lotus throne. Flowing saffron robes draped elegantly with intricate golden embroidery patterns. Radiant golden aura surrounding the entire figure. Soft warm lighting from within creating ethereal glow effect. Closed eyes with a subtle knowing smile. One hand in meditation mudra. Pure white/light background like divine realm. Photorealistic with soft focus on edges. masterpiece, best quality, highly detailed 8k illustration.",
  "visualHint": "buddha serene divine"
}

## CRITICAL RULES
1. ALWAYS write visualDescription in English
2. Use SPECIFIC hex color codes for important colors
3. Add quality tags: "masterpiece, best quality, highly detailed"
4. Keep description between 150-250 words
5. Return ONLY the JSON object - no explanations, no markdown
6. Infer appearance from character name and story context`;

/**
 * 构建角色描述提取的提示词（剧情描述）
 */
export function buildCharacterExtractPrompt(
  script: string,
  style: string = "anime",
  customTemplate?: string
): string {
  const systemPrompt = customTemplate || DEFAULT_CHARACTER_DESCRIPTION_TEMPLATE;

  return `${systemPrompt}

SCRIPT:
${script}

Analyze the script and extract character information. Return ONLY a valid JSON object.`;
}

/**
 * 构建视觉描述提示词
 */
export function buildVisualDescriptionPrompt(
  characters: Array<{ name: string; scope: string; description: string }>,
  script: string,
  style: string = "anime"
): string {
  const charactersJson = JSON.stringify(characters, null, 2);

  return `${VISUAL_DESCRIPTION_SYSTEM_PROMPT}

CHARACTERS TO DESIGN (from script analysis):
${charactersJson}

SCRIPT CONTEXT:
${script}

## STYLE REQUIREMENTS
${style === "anime" ? "- Anime cel-shading style with clean lineart\n- Vibrant saturated colors\n- Large expressive eyes with highlights\n- Dynamic hair with wind effects" : style === "realistic" ? "- Photorealistic textures and materials\n- Cinematic color grading\n- Professional studio lighting\n- Depth of field effects" : style === "3d" ? "- Smooth 3D rendering quality\n- Pixar/Disney shading\n- Studio lighting\n- Polished surfaces" : "- Cartoon style with bold outlines\n- Simplified shapes\n- Bright saturated colors"}

IMPORTANT:
1. Infer physical appearance from the character's name, story context, and traditional interpretations
2. For Sun Wukong: monkey features, golden armor, Ruyi Cudgel, Phoenix Crown
3. For Buddha figures: serene expression, Buddha robes, lotus throne, golden aura
4. Return ONLY a valid JSON object - no markdown formatting, no explanations`;
}

/**
 * 获取指定风格的默认角色提示词
 */
function getDefaultCharacterPrompt(style: string): string {
  const styleInstructions: Record<string, string> = {
    anime: "The visual style should match anime aesthetics: expressive features, dynamic poses, vibrant colors, and characteristic anime art elements.",
    realistic: "The visual style should be photorealistic: natural proportions, realistic lighting, authentic textures, and cinematic quality.",
    "3d": "The visual style should be 3D animated: smooth models, studio lighting, polished surfaces, and modern animation aesthetics.",
    cartoon: "The visual style should be cartoon: bold outlines, simplified shapes, bright saturated colors, and playful design."
  };

  return styleInstructions[style] || styleInstructions.anime;
}

/**
 * 验证模板 JSON 格式
 */
export function validateTemplateJSON(jsonString: string): boolean {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed.characters || !Array.isArray(parsed.characters)) {
      return false;
    }
    for (const char of parsed.characters) {
      if (typeof char.name !== "string" || typeof char.description !== "string") {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}
