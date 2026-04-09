/**
 * 项目详情 API
 */
import { NextResponse } from "next/server";
import { db, projects, characters, shots, dialogues } from "@/lib/db";
import { eq } from "drizzle-orm";

// GET - 获取项目详情
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  try {
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, id),
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const projectCharacters = await db.query.characters.findMany({
      where: eq(characters.projectId, id),
    });

    const projectShots = await db.query.shots.findMany({
      where: eq(shots.projectId, id),
      orderBy: (s, { asc }) => [asc(s.sequence)],
    });

    // 获取每个分镜的对白
    const shotsWithDialogues = await Promise.all(
      projectShots.map(async (shot) => {
        const shotDialogues = await db.query.dialogues.findMany({
          where: eq(dialogues.shotId, shot.id),
          orderBy: (d, { asc }) => [asc(d.sequence)],
        });
        return { ...shot, dialogues: shotDialogues };
      })
    );

    return NextResponse.json({
      project,
      characters: projectCharacters,
      shots: shotsWithDialogues,
    });
  } catch (error) {
    console.error("Error fetching project:", error);
    return NextResponse.json(
      { error: "Failed to fetch project" },
      { status: 500 }
    );
  }
}

// PUT - 更新项目
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  try {
    const body = await request.json();
    const { title, idea, script, style, aspectRatio, status } = body;

    await db.update(projects)
      .set({
        title: title ?? undefined,
        idea: idea ?? undefined,
        script: script ?? undefined,
        style: style ?? undefined,
        aspectRatio: aspectRatio ?? undefined,
        status: status ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id));

    const updatedProject = await db.query.projects.findFirst({
      where: eq(projects.id, id),
    });

    return NextResponse.json({ project: updatedProject });
  } catch (error) {
    console.error("Error updating project:", error);
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 }
    );
  }
}

// DELETE - 删除项目
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  try {
    await db.delete(projects).where(eq(projects.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting project:", error);
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 }
    );
  }
}
