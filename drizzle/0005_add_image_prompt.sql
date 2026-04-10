-- 添加 image_prompt 字段用于存储角色图生成提示词模板
ALTER TABLE `projects` ADD COLUMN `image_prompt` text;

-- 设置默认值（角色四视图提示词模板）
UPDATE `projects` SET `image_prompt` = 'Character four-view reference sheet — professional character design document.

=== CRITICAL: ART STYLE FIDELITY ===
The CHARACTER DESCRIPTION below is authoritative. It may specify an art style explicitly, implicitly, or through a combination of modifiers (e.g. "3D 国漫 CG 渲染", "水墨写意", "赛博朋克像素画", "cel-shaded anime", "oil painting portrait", "PBR realtime render").

Rules for interpreting style:
1. Treat the FULL style phrase as one atomic instruction. Do NOT cherry-pick individual words and map them to a default bucket.
2. Style modifiers like "写实 / realistic / 高清 / 精致" describe RENDERING FIDELITY, not medium. They raise detail level within the chosen medium.
3. The medium (2D illustration / 3D CG / photograph / painting / pixel / etc.) is determined ONLY by explicit medium words. In the ABSENCE of such explicit photographic words, DO NOT output a photograph or live-action render.
4. Color palette, lighting mood, and era references in the description are MANDATORY and must be honored exactly.
5. If no style is mentioned at all, infer the most appropriate stylized illustration. Default to stylized illustration, NOT photography.

=== CHARACTER DESCRIPTION (authoritative) ===
Name: {CHARACTER_NAME}
Style: {STYLE}
Visual Description: {DESCRIPTION}

=== FACE — HIGH DETAIL ===
Render the face with precision appropriate to the chosen medium and style:
- Consistent facial bone structure, eye shape, nose, mouth — matching the description exactly
- Eyes expressive and detailed, rendered in the chosen medium''s idiom
- Hair with defined volume, color and flow, rendered in the chosen medium''s idiom
- The face must be striking, memorable, and instantly recognizable across all four views

=== WEAPONS, COSTUME & EQUIPMENT ===
- All props, armor, clothing and equipment must be rendered in the SAME medium and style as the character
- Material detail must match the style (painterly strokes for paintings, PBR materials for 3D CG, clean flats for anime, etc.)
- Scale and anatomy must be correct relative to the body

=== FOUR-VIEW LAYOUT ===
Four views arranged LEFT to RIGHT on a clean pure white canvas, consistent medium shot (waist to crown) across all four:
1. FRONT — facing viewer directly, showing full outfit and any held items
2. THREE-QUARTER — rotated ~45° right, showing face depth and dimensional form
3. SIDE PROFILE — perfect 90° facing right, clear silhouette
4. BACK — fully facing away, hairstyle and clothing back detail

=== LIGHTING & RENDERING ===
- Clean professional key/fill/rim lighting, consistent direction across all four views
- Pure white background for clean character separation
- Highest quality achievable WITHIN the chosen medium and style

=== CONSISTENCY ACROSS ALL FOUR VIEWS ===
- Identical character identity, proportions and colors in every view
- Identical outfit, accessories, weapon placement, hair
- Heads aligned at the same top edge, waist at the same bottom edge

=== CHARACTER NAME LABEL ===
Display the character''s name "{CHARACTER_NAME}" as a clean typographic label below the four-view layout. Use a modern sans-serif font, dark text on white background, centered alignment.

=== FINAL OUTPUT STANDARD ===
Professional character design reference sheet. masterpiece, best quality, highly detailed.';
