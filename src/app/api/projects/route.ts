/**
 * 项目列表 API
 */
import { NextResponse } from "next/server";
import { db, projects } from "@/lib/db";
import { ulid } from "ulid";
import { desc } from "drizzle-orm";

// GET - 获取项目列表
export async function GET() {
  try {
    const projectList = await db.query.projects.findMany({
      orderBy: [desc(projects.createdAt)],
    });
    return NextResponse.json({ projects: projectList });
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

// POST - 创建新项目
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, idea, script, style, aspectRatio } = body;

    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    const id = ulid();
    await db.insert(projects).values({
      id,
      title,
      idea: idea || "",
      script: script || "",
      style: style || "anime",
      aspectRatio: aspectRatio || "16:9",
      status: "draft",
    });

    const newProject = await db.query.projects.findFirst({
      where: (p, { eq }) => eq(p.id, id),
    });

    return NextResponse.json({ project: newProject }, { status: 201 });
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}
