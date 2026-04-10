/**
 * ComfyUI 工作流模板上传 API
 * 允许上传模板到 src/app/api/templates/comfyui-json 目录
 */
import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

const TEMPLATES_DIR = path.join(process.cwd(), "src/app/api/templates/comfyui-json");

/**
 * GET /api/templates/comfyui-json
 * 获取所有已上传的模板列表
 */
export async function GET() {
  try {
    if (!fs.existsSync(TEMPLATES_DIR)) {
      fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
    }

    const files = fs.readdirSync(TEMPLATES_DIR)
      .filter(f => f.endsWith('.json'));

    const templates = files.map(file => {
      try {
        const content = fs.readFileSync(path.join(TEMPLATES_DIR, file), 'utf-8');
        const workflow = JSON.parse(content);
        const classTypes = new Set<string>();
        
        for (const node of Object.values(workflow)) {
          if (typeof node === 'object' && node !== null) {
            const n = node as Record<string, unknown>;
            if (n.class_type) {
              classTypes.add(n.class_type as string);
            }
          }
        }

        // 检测模板类型
        const classTypesStr = Array.from(classTypes).join(' ').toLowerCase();
        let category: 'image' | 'video' | 'i2v' = 'image';
        if (classTypesStr.includes('wan') || classTypesStr.includes('i2v') || classTypesStr.includes('video')) {
          category = 'video';
        } else if (classTypesStr.includes('loadimage') && !classTypesStr.includes('empty')) {
          category = 'i2v'; // 图生图
        }

        return {
          file,
          category,
          nodeCount: Object.keys(workflow).length,
          classTypes: Array.from(classTypes),
        };
      } catch {
        return {
          file,
          error: 'Invalid JSON',
          category: 'image' as const,
          nodeCount: 0,
          classTypes: [],
        };
      }
    });

    return NextResponse.json({
      templates,
      total: templates.length,
    });
  } catch (error) {
    console.error('[API] Failed to list templates:', error);
    return NextResponse.json(
      { error: 'Failed to list templates' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/templates/comfyui-json
 * 上传新的工作流模板
 * 
 * Form data:
 * - file: 工作流 JSON 文件
 */
export async function POST(request: NextRequest) {
  try {
    if (!fs.existsSync(TEMPLATES_DIR)) {
      fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    // 验证文件类型
    if (!file.name.endsWith(".json")) {
      return NextResponse.json(
        { error: "Only JSON files are allowed" },
        { status: 400 }
      );
    }

    // 读取文件内容
    const fileContent = await file.text();

    // 验证 JSON 格式
    let workflow: Record<string, unknown>;
    try {
      workflow = JSON.parse(fileContent);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON format" },
        { status: 400 }
      );
    }

    // 验证基本工作流结构
    if (!workflow || typeof workflow !== "object" || Object.keys(workflow).length === 0) {
      return NextResponse.json(
        { error: "Invalid workflow: empty or missing nodes" },
        { status: 400 }
      );
    }

    // 生成安全的文件名
    let safeFileName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    
    // 如果文件已存在，添加时间戳
    const filePath = path.join(TEMPLATES_DIR, safeFileName);
    if (fs.existsSync(filePath)) {
      const timestamp = Date.now();
      const ext = path.extname(safeFileName);
      const name = path.basename(safeFileName, ext);
      safeFileName = `${name}_${timestamp}${ext}`;
    }

    // 保存文件
    const finalPath = path.join(TEMPLATES_DIR, safeFileName);
    fs.writeFileSync(finalPath, fileContent, 'utf-8');

    // 提取节点信息
    const classTypes = new Set<string>();
    for (const node of Object.values(workflow)) {
      if (typeof node === 'object' && node !== null) {
        const n = node as Record<string, unknown>;
        if (n.class_type) {
          classTypes.add(n.class_type as string);
        }
      }
    }

    console.log(`[API] Template uploaded: ${safeFileName}`);

    return NextResponse.json({
      success: true,
      message: "Template uploaded successfully",
      fileName: safeFileName,
      nodeCount: Object.keys(workflow).length,
      classTypes: Array.from(classTypes),
    });
  } catch (error) {
    console.error('[API] Failed to upload template:', error);
    return NextResponse.json(
      { error: 'Failed to upload template' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/templates/comfyui-json?file=xxx
 * 删除指定模板
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get("file");

    if (!fileName) {
      return NextResponse.json(
        { error: "File name is required" },
        { status: 400 }
      );
    }

    // 安全检查：只允许删除 .json 文件
    if (!fileName.endsWith('.json') || fileName.includes('..') || fileName.includes('/')) {
      return NextResponse.json(
        { error: "Invalid file name" },
        { status: 400 }
      );
    }

    const filePath = path.join(TEMPLATES_DIR, fileName);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    fs.unlinkSync(filePath);
    console.log(`[API] Template deleted: ${fileName}`);

    return NextResponse.json({
      success: true,
      message: "Template deleted successfully",
      fileName,
    });
  } catch (error) {
    console.error('[API] Failed to delete template:', error);
    return NextResponse.json(
      { error: 'Failed to delete template' },
      { status: 500 }
    );
  }
}
