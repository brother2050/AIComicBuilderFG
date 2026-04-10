/**
 * 帧图生成 Prompt
 * 为分镜生成首帧和尾帧的详细描述
 */
import { getStyleDescription } from "@/lib/utils";

/**
 * 专业角色四视图参考图提示词
 * 用于生成角色的前视、四分之三视、侧视、后视四视图
 */
export const characterFourViewPrompt = `Create a PROFESSIONAL CHARACTER REFERENCE SHEET with four distinct views.

=== CHARACTER DETAILS ===
Style: {STYLE}
Character Name: {CHARACTER_NAME}
Visual Description: {DESCRIPTION}

=== VIEW REQUIREMENTS ===
Create a 2x2 grid layout with the following four views:

1. FRONT VIEW (Top-Left)
   - Perfect straight-on facing camera
   - Neutral, confident expression
   - Arms relaxed at sides or subtle pose
   - Full body visible

2. THREE-QUARTER VIEW (Top-Right)
   - 45-degree angle from camera
   - Shows face and body profile together
   - Natural standing pose
   - Best view for character recognition

3. SIDE PROFILE (Bottom-Left)
   - Exact 90-degree side view
   - Distinct profile features
   - Shows silhouette and posture
   - Includes weapon/prop on hip if applicable

4. BACK VIEW (Bottom-Right)
   - Rear view showing cape/hair/weapon
   - Shows any back details or emblems
   - Hair physics and movement
   - Back accessories visible

=== TECHNICAL REQUIREMENTS ===
- Background: Clean white (#FFFFFF) or light gray (#F5F5F5) studio backdrop
- Lighting: Professional 3-point studio lighting with soft shadows
  - Key light: Front-left at 45 degrees
  - Fill light: Front-right at lower intensity
  - Rim light: Behind for edge highlighting
- Resolution Quality Tags: masterpiece, best quality, highly detailed, intricate, 8k UHD
- Style Consistency: All four views must match perfectly in:
  - Art style and rendering quality
  - Body proportions and anatomy
  - Color palette and shading
  - Clothing details and accessories
  - Hair style and physics

=== STYLE-SPECIFIC ADDITIONS ===
- ANIME: Cel-shading, clean lineart, vibrant colors, large expressive eyes with highlights
- REALISTIC: Photorealistic textures, natural proportions, cinematic color grading
- 3D: Smooth 3D rendering, SubSurface Scattering, studio lighting, Pixar-quality
- CARTOON: Bold black outlines, simplified shapes, bright saturated colors

=== OUTPUT FORMAT ===
Professional character turn-around sheet, each view clearly delineated, consistent quality across all views, suitable for animation and game development.`;

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
