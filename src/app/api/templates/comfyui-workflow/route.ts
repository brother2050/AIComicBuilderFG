/**
 * ComfyUI 工作流模板 API
 */
import { NextRequest, NextResponse } from "next/server";
import { loadWorkflowTemplate, getAvailableTemplates } from "@/lib/ai/providers/workflow-template";

// 获取模板列表
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category"); // image, video, i2v, all
    const templateId = searchParams.get("id"); // 获取单个模板详情

    // 获取单个模板
    if (templateId) {
      const templates = getAvailableTemplates();
      const template = templates.find(t => t.id === templateId);
      
      if (!template) {
        return NextResponse.json(
          { success: false, error: "Template not found" },
          { status: 404 }
        );
      }
      
      // 加载完整的工作流 JSON
      const workflow = loadWorkflowTemplate(template.file);
      
      return NextResponse.json({
        success: true,
        template: { ...template, workflow }
      });
    }

    // 获取所有模板列表
    let templates = getAvailableTemplates();
    
    // 按类别过滤
    if (category && category !== "all") {
      templates = templates.filter(t => t.category === category);
    }

    return NextResponse.json({
      success: true,
      templates,
    });
  } catch (error) {
    console.error("[API] Failed to get templates:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get templates" },
      { status: 500 }
    );
  }
}
