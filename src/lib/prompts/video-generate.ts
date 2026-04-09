/**
 * 视频生成 Prompt
 * 为视频模型生成提示词
 */

export function buildVideoPrompt(params: {
  videoScript: string;
  startFrameDesc: string;
  endFrameDesc: string;
  duration: number;
  characters: Array<{ name: string; visualHint: string }>;
  dialogues?: Array<{ character: string; text: string }>;
  cameraDirection: string;
}): string {
  const lines: string[] = [];

  // 时长声明
  lines.push(`Duration: ${params.duration}s.`);

  // 角色标识
  const charList = params.characters
    .map(c => `${c.name}（${c.visualHint}）`)
    .join(", ");
  if (charList) {
    lines.push(`Characters: ${charList}.`);
  }

  // 帧间插值指令
  lines.push(`Smoothly interpolate from opening frame to closing frame.`);

  // 视频脚本
  lines.push(params.videoScript);

  // 镜头运动
  const cameraMap: Record<string, string> = {
    "static": "static camera, no movement",
    "pan left": "slow pan to the left",
    "pan right": "slow pan to the right",
    "tracking shot": "tracking shot, following subject",
    "dolly in": "dolly in, approaching subject",
    "dolly out": "dolly out, revealing environment",
    "crane up": "crane up, rising above scene",
    "crane down": "crane down, descending to scene",
    "tilt up": "tilt up, looking upward",
    "tilt down": "tilt down, looking downward",
  };
  lines.push(`Camera: ${cameraMap[params.cameraDirection] || params.cameraDirection}.`);

  // 帧锚点描述
  lines.push(`[FRAME ANCHORS]`);
  lines.push(`Opening frame: ${params.startFrameDesc.substring(0, 200)}`);
  lines.push(`Closing frame: ${params.endFrameDesc.substring(0, 200)}`);

  // 对白口型
  if (params.dialogues && params.dialogues.length > 0) {
    lines.push(`【Lip Sync】`);
    for (const d of params.dialogues) {
      lines.push(`${d.character}: "${d.text}"`);
    }
  }

  return lines.join("\n");
}
