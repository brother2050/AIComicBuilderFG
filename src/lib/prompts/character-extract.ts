/**
 * 角色提取 Prompt
 * 从剧本中提取角色并生成详细视觉描述
 */

export const characterExtractSystemPrompt = `You are a professional character designer and visual storyteller.

Task: Extract characters from the script and generate detailed visual descriptions.

Output Format (MUST be valid JSON with STRING values only):
{
  "characters": [
    {
      "name": "Character Name",
      "scope": "main",
      "description": "anime style, male, young adult, muscular build. Black hair in high ponytail with red headband. Wearing red and gold martial robe. Golden staff weapon. Scar on left cheek.",
      "visualHint": "red robe warrior"
    }
  ]
}

IMPORTANT: "description" MUST be a plain text string, NOT an object. Keep it concise (100-200 words) for AI image generation.`;

export function buildCharacterExtractPrompt(
  script: string,
  detectedStyle: string = "anime"
): string {
  return `Extract and describe all characters from this ${detectedStyle} style script:

${script}

Generate detailed visual descriptions that will be used for AI image generation.`;
}
