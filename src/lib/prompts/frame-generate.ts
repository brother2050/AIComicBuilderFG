/**
 * 帧图生成 Prompt
 * 为分镜生成首帧和尾帧的详细描述
 */
import { getStyleDescription } from "@/lib/utils";

export const characterFourViewPrompt = `Create a character reference sheet with four views.

Style: {STYLE}
Character: {CHARACTER_NAME}
Description: {DESCRIPTION}

Requirements:
- FRONT VIEW: Straight-on facing, neutral expression
- THREE-QUARTER VIEW: 45-degree angle
- SIDE PROFILE: Exact 90-degree side view
- BACK VIEW: Rear view

Environment: Pure white background, professional studio lighting
Format: Each view clearly labeled at the bottom
Consistency: All views must match exactly in style, proportions, and details`;

export function buildFirstFramePrompt(params: {
  shotDescription: string;
  characterReferences: Array<{ name: string; visualHint: string; referenceImage?: string }>;
  style: string;
  previousShotEndFrame?: string;
}): string {
  const styleDesc = getStyleDescription(params.style);

  return `Create the OPENING FRAME of this shot.

=== SHOT DESCRIPTION ===
${params.shotDescription}

=== ART STYLE ===
${styleDesc}

=== CHARACTER REFERENCE SHEETS ===
${params.characterReferences.map(c =>
  `- ${c.name}（${c.visualHint}）` + (c.referenceImage ? ` [Reference image available]` : '')
).join('\n')}

=== CONTINUITY REQUIREMENT ===
${params.previousShotEndFrame
  ? `This shot continues from: ${params.previousShotEndFrame}
  - Character poses must match the previous shot's ending
  - Maintain visual consistency in clothing and appearance`
  : 'First shot in sequence - establish the scene'}`;
}

export function buildLastFramePrompt(params: {
  shotDescription: string;
  characterReferences: Array<{ name: string; visualHint: string; referenceImage?: string }>;
  style: string;
}): string {
  const styleDesc = getStyleDescription(params.style);

  return `Create the CLOSING FRAME of this shot.

=== SHOT DESCRIPTION ===
${params.shotDescription}

=== ART STYLE ===
${styleDesc}

=== CHARACTER REFERENCE SHEETS ===
${params.characterReferences.map(c =>
  `- ${c.name}（${c.visualHint}）` + (c.referenceImage ? ` [Reference image available]` : '')
).join('\n')}

=== CRITICAL REQUIREMENTS ===
- MUST match the EXACT art style of the opening frame
- Same environment, lighting, color temperature
- Same clothing (no changes allowed)
- End frame MUST be a STABLE POSE (for next shot continuity)
- Character expression should be natural for potential pause point`;
}
