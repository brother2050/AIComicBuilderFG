/**
 * 集数管理 API
 * 支持添加新集、重置集数等操作
 */
import { NextResponse } from "next/server";
import { db, projects, characters, shots } from "@/lib/db";
import { eq } from "drizzle-orm";

/**
 * POST /api/projects/[id]/episodes
 * 添加新集
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const { action } = body;

    // 查找项目
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const currentTotal = project.totalEpisodes || 1;
    const newTotal = currentTotal + 1;

    // 更新项目总集数
    await db.update(projects)
      .set({ 
        totalEpisodes: newTotal,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    console.log(`[API] Added new episode. Project: ${projectId}, new total: ${newTotal}`);

    return NextResponse.json({
      success: true,
      totalEpisodes: newTotal,
      message: `已添加第 ${newTotal} 集`,
    });
  } catch (error) {
    console.error("[API] Failed to add episode:", error);
    return NextResponse.json(
      { error: "Failed to add episode" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/projects/[id]/episodes
 * 更新集数配置
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  try {
    const body = await request.json();
    const { totalEpisodes, resetEpisodes } = body;

    // 查找项目
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // 如果需要重置（减少集数），删除多余集数的角色和分镜
    if (resetEpisodes && totalEpisodes < (project.totalEpisodes || 1)) {
      // 删除指定集数之后的角色
      await db.delete(characters)
        .where(eq(characters.projectId, projectId));
      
      // 删除指定集数之后的分镜
      await db.delete(shots)
        .where(eq(shots.projectId, projectId));
      
      console.log(`[API] Reset episodes for project: ${projectId}`);
    }

    // 更新项目总集数
    await db.update(projects)
      .set({ 
        totalEpisodes: totalEpisodes || 1,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    return NextResponse.json({
      success: true,
      totalEpisodes: totalEpisodes || 1,
    });
  } catch (error) {
    console.error("[API] Failed to update episodes:", error);
    return NextResponse.json(
      { error: "Failed to update episodes" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/projects/[id]/episodes
 * 获取集数信息
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  try {
    // 查找项目
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // 获取每个集的角色和分镜数量
    const charactersByEpisode = await db.query.characters.findMany({
      where: eq(characters.projectId, projectId),
    });

    const shotsByEpisode = await db.query.shots.findMany({
      where: eq(shots.projectId, projectId),
    });

    return NextResponse.json({
      totalEpisodes: project.totalEpisodes || 1,
      charactersByEpisode,
      shotsByEpisode,
    });
  } catch (error) {
    console.error("[API] Failed to get episodes:", error);
    return NextResponse.json(
      { error: "Failed to get episodes" },
      { status: 500 }
    );
  }
}
