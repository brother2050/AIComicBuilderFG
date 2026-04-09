/**
 * 视频组装流水线
 * 使用FFmpeg将所有视频片段拼接成最终成片
 */
import { db, shots, projects } from "@/lib/db";
import { eq } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { ulid } from "ulid";

export async function assembleVideo(projectId: string): Promise<string> {
  console.log(`[Pipeline] Starting video assembly for project: ${projectId}`);

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const projectShots = await db.query.shots.findMany({
    where: eq(shots.projectId, projectId),
    orderBy: (s, { asc }) => [asc(s.sequence)],
  });

  // 收集有效视频
  const videoPaths: string[] = [];
  for (const shot of projectShots) {
    if (shot.videoUrl && fs.existsSync(shot.videoUrl)) {
      videoPaths.push(shot.videoUrl);
    }
  }

  if (videoPaths.length === 0) {
    throw new Error("No valid videos to assemble");
  }

  const uploadDir = process.env.UPLOAD_DIR || "./uploads";
  const outputDir = path.join(uploadDir, "final");
  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `${projectId}_final.mp4`);

  // 如果只有一个视频，直接复制
  if (videoPaths.length === 1) {
    fs.copyFileSync(videoPaths[0], outputPath);
  } else {
    // 使用FFmpeg concat
    const concatListPath = path.join(outputDir, `${ulid()}_concat.txt`);
    const concatList = videoPaths.map(p => `file '${p}'`).join("\n");
    fs.writeFileSync(concatListPath, concatList);

    // 执行FFmpeg拼接
    const { execSync } = await import("child_process");
    try {
      execSync(
        `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${outputPath}"`,
        { stdio: "pipe" }
      );
    } finally {
      // 清理临时文件
      fs.unlinkSync(concatListPath);
    }
  }

  // 更新项目状态
  await db.update(projects)
    .set({ 
      finalVideoUrl: outputPath,
      status: "completed",
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  console.log(`[Pipeline] Final video assembled: ${outputPath}`);

  return outputPath;
}
