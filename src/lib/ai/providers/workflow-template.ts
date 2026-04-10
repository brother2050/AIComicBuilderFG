/**
 * ComfyUI 工作流模板管理
 * 从 JSON 文件加载工作流模板，支持参数替换
 */
import * as fs from "fs";
import * as path from "path";

// 模板目录
const TEMPLATES_DIR = path.join(process.cwd(), "src/app/api/templates/comfyui-json");

export interface WorkflowParams {
  prompt?: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  seed?: number;
  // 首尾帧
  first_frame?: string;
  last_frame?: string;
  // 视频参数
  duration?: number;
  frame_length?: number;
  cfg?: number;
  denoise?: number;
  // 模型参数
  model?: string;
  vae?: string;
  clip?: string;
  lora?: string;
  lora_strength_model?: number;
  lora_strength_clip?: number;
  [key: string]: string | number | undefined;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: "image" | "video" | "i2v";
  file: string;
  params: {
    width?: { default: number; min?: number; max?: number; step?: number };
    height?: { default: number; min?: number; max?: number; step?: number };
    steps?: { default: number; min?: number; max?: number; step?: number };
    seed?: { default: number };
    cfg?: { default: number; min?: number; max?: number };
    [key: string]: { default: number | string } | undefined;
  };
  placeholder_mapping?: Record<string, { node_type: string; input_name: string }>;
}

/**
 * 加载工作流模板 JSON
 */
export function loadWorkflowTemplate(filename: string): Record<string, unknown> | null {
  try {
    const filepath = path.join(TEMPLATES_DIR, filename);
    if (!fs.existsSync(filepath)) {
      console.warn(`[WorkflowTemplate] Template not found: ${filepath}`);
      return null;
    }
    const content = fs.readFileSync(filepath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error(`[WorkflowTemplate] Failed to load template ${filename}:`, error);
    return null;
  }
}

/**
 * 将数组格式工作流转换为 ComfyUI API 格式
 * 返回仅包含节点的对象，节点 ID 使用整数
 */
function convertArrayToAPIMode(workflow: Record<string, unknown>): Record<number, Record<string, unknown>> {
  // 检查是否有 nodes 字段
  const rawNodes = workflow.nodes;
  
  // 如果没有 nodes 字段，检查是否是直接的节点字典格式（如 standard_sd15.json）
  if (rawNodes === undefined) {
    const result: Record<number, Record<string, unknown>> = {};
    for (const [key, value] of Object.entries(workflow)) {
      // 跳过元数据字段
      if (key === 'id' || key === 'last_node_id' || key === 'last_link_id') continue;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value) && 'class_type' in value) {
        result[Number(key)] = value as Record<string, unknown>;
      }
    }
    if (Object.keys(result).length === 0) {
      return {};
    }
    return result;
  }
  
  // 如果 nodes 不是数组，认为已经是对象格式
  if (!Array.isArray(rawNodes) || !rawNodes) {
    // 确保节点 ID 是整数格式
    const nodes = rawNodes as Record<string, Record<string, unknown>> | undefined;
    const result: Record<number, Record<string, unknown>> = {};
    if (nodes) {
      for (const [key, value] of Object.entries(nodes)) {
        if (typeof value === 'object' && value !== null && 'class_type' in value) {
          result[Number(key)] = value as Record<string, unknown>;
        }
      }
    }
    // 如果没有有效节点，返回空对象
    if (Object.keys(result).length === 0) {
      return {};
    }
    return result;
  }
  
  const nodes = rawNodes as Array<Record<string, unknown>>;
  
  // 过滤掉非执行节点（如 MarkdownNote、Note 等 UI 注释节点）
  const nonExecutableTypes = ['MarkdownNote', 'Note', 'Reroute', 'WorkflowInfo'];
  
  // 转换节点数组为对象格式，使用整数 ID
  const nodesObj: Record<number, Record<string, unknown>> = {};
  for (const node of nodes) {
    const nodeId = Number(node.id);
    const classType = node.type as string;
    
    // 跳过非执行节点
    if (nonExecutableTypes.includes(classType)) {
      continue;
    }
    
    const inputs = node.inputs as Array<Record<string, unknown>> | undefined;
    
    // 构建输入对象
    const inputValues: Record<string, unknown> = {};
    if (Array.isArray(inputs)) {
      for (const input of inputs) {
        const name = input.name as string;
        const link = input.link;
        if (link !== null && link !== undefined) {
          // 这是节点引用，格式为 [sourceNodeId, sourceOutputIndex]
          const nodeOutput = findNodeOutputByLink(nodes, Number(link));
          if (nodeOutput) {
            inputValues[name] = nodeOutput;
          }
        }
      }
    }
    
    // 处理 widgets_values
    const widgetsValues = node.widgets_values as unknown[];
    if (Array.isArray(widgetsValues)) {
      fillWidgetInputs(inputValues, classType, widgetsValues);
    }
    
    nodesObj[nodeId] = {
      class_type: classType,
      inputs: inputValues
    };
  }
  
  return nodesObj;
}

/**
 * 根据 link ID 查找对应的节点输出
 */
function findNodeOutputByLink(nodes: Array<Record<string, unknown>>, linkId: number): [string, number] | null {
  for (const node of nodes) {
    const outputs = node.outputs as Array<{ name: string; links?: number[] }> | undefined;
    if (Array.isArray(outputs)) {
      for (let i = 0; i < outputs.length; i++) {
        const output = outputs[i];
        if (output.links && Array.isArray(output.links) && output.links.includes(linkId as number)) {
          return [String(node.id), i];
        }
      }
    }
  }
  return null;
}

/**
 * 根据节点类型填充 widget 输入
 */
function fillWidgetInputs(
  inputs: Record<string, unknown>,
  classType: string,
  widgetsValues: unknown[]
): void {
  switch (classType) {
    case 'CheckpointLoaderSimple':
      if (widgetsValues[0]) inputs['ckpt_name'] = widgetsValues[0];
      break;
    case 'KSampler':
      if (widgetsValues[0]) inputs['seed'] = widgetsValues[0];
      if (widgetsValues[1]) inputs['control_after_generate'] = widgetsValues[1];
      if (widgetsValues[2]) inputs['steps'] = widgetsValues[2];
      if (widgetsValues[3]) inputs['cfg'] = widgetsValues[3];
      if (widgetsValues[4]) inputs['sampler_name'] = widgetsValues[4];
      if (widgetsValues[5]) inputs['scheduler'] = widgetsValues[5];
      if (widgetsValues[6]) inputs['denoise'] = widgetsValues[6];
      break;
    case 'EmptyLatentImage':
      if (widgetsValues[0]) inputs['width'] = widgetsValues[0];
      if (widgetsValues[1]) inputs['height'] = widgetsValues[1];
      if (widgetsValues[2]) inputs['batch_size'] = widgetsValues[2];
      break;
    case 'CLIPTextEncode':
      if (widgetsValues[0]) inputs['text'] = widgetsValues[0];
      break;
    case 'VAEDecode':
    case 'VAEDecode_Tiled':
      // 没有 widget 输入
      break;
    case 'SaveImage':
      if (widgetsValues[0]) inputs['filename_prefix'] = widgetsValues[0];
      break;
    case 'PrimitiveNode':
      if (widgetsValues[0] !== undefined) inputs['value'] = widgetsValues[0];
      break;
  }
}

/**
 * 替换字符串中的占位符
 * @param text 要替换的文本
 * @param params 参数对象
 * @param templateDefaults 模板定义的默认值
 */
function replacePlaceholders(
  text: string, 
  params: WorkflowParams, 
  templateDefaults?: { model?: string; vae?: string; clip?: string; lora?: string }
): string | number {
  // 处理 __NUM:xxx__ 格式的数字占位符
  const numMatch = text.match(/^__NUM:(\w+)__$/);
  if (numMatch) {
    const paramName = numMatch[1];
    const value = params[paramName as keyof WorkflowParams];
    if (value !== undefined) {
      return Number(value);
    }
    return text;
  }
  
  // 处理 __MODEL__ 占位符
  if (text === '__MODEL__') {
    if (params.model && String(params.model).trim()) {
      return String(params.model);
    }
    if (templateDefaults?.model) {
      return templateDefaults.model;
    }
    console.warn('[WorkflowTemplate] __MODEL__ placeholder not resolved, no default value');
    return '';
  }
  
  // 处理 __VAE__ 占位符
  if (text === '__VAE__') {
    if (params.vae && String(params.vae).trim()) {
      return String(params.vae);
    }
    if (templateDefaults?.vae) {
      return templateDefaults.vae;
    }
    console.warn('[WorkflowTemplate] __VAE__ placeholder not resolved, no default value');
    return '';
  }
  
  // 处理 __CLIP__ 占位符
  if (text === '__CLIP__') {
    if (params.clip && String(params.clip).trim()) {
      return String(params.clip);
    }
    if (templateDefaults?.clip) {
      return templateDefaults.clip;
    }
    console.warn('[WorkflowTemplate] __CLIP__ placeholder not resolved, no default value');
    return '';
  }
  
  // 处理 __LORA__ 占位符
  if (text === '__LORA__') {
    if (params.lora && String(params.lora).trim()) {
      return String(params.lora);
    }
    if (templateDefaults?.lora) {
      return templateDefaults.lora;
    }
    console.warn('[WorkflowTemplate] __LORA__ placeholder not resolved, no default value');
    return '';
  }
  
  // 处理 {{xxx}} 格式的字符串占位符
  let result = text;
  
  // 处理 positive_prompt -> prompt
  if (result.includes('{{positive_prompt}}')) {
    result = result.replace(/\{\{positive_prompt\}\}/g, String(params.prompt || ''));
  }
  // 处理 negative_prompt
  if (result.includes('{{negative_prompt}}')) {
    result = result.replace(/\{\{negative_prompt\}\}/g, String(params.negative_prompt || ''));
  }
  // 处理其他通用占位符
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && key !== 'prompt' && key !== 'negative_prompt' && key !== 'model' && key !== 'vae' && key !== 'clip') {
      const placeholder = `{{${key}}}`;
      if (result.includes(placeholder)) {
        result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
      }
    }
  }
  return result;
}

/**
 * 应用参数到工作流
 * 支持占位符替换和节点属性修改
 * 自动将数组格式转换为 ComfyUI API 格式
 * 注意：子图格式的工作流应由调用方检测并替换为 API 版本后再传入
 */
export function applyWorkflowParams(
  workflow: Record<string, unknown>,
  params: WorkflowParams
): Record<number, Record<string, unknown>> {
  // 从模板获取默认值（由模板定义，不是硬编码）
  const templateDefaults = {
    model: workflow._defaultModel as string | undefined,
    vae: workflow._defaultVAE as string | undefined,
    clip: workflow._defaultCLIP as string | undefined,
    lora: workflow._defaultLora as string | undefined,
  };

  console.log(`[WorkflowTemplate] Template defaults:`, templateDefaults);

  // 深拷贝工作流
  const result = JSON.parse(JSON.stringify(workflow)) as Record<string, unknown>;
  
  // 先将数组格式（UI 格式）转换为对象格式（API 格式）
  // convertArrayToAPIMode 返回仅包含节点的字典，节点 ID 为整数
  const convertedNodes = convertArrayToAPIMode(result);
  
  // 获取节点对象（已经是纯节点字典格式）
  // Object.entries 将数字键转换为字符串
  const nodeEntries = Object.entries(convertedNodes) as [string, Record<string, unknown>][];
  
  if (nodeEntries.length === 0) {
    console.warn('[WorkflowTemplate] No nodes found in workflow');
    return convertedNodes;
  }
  
  // 遍历每个节点
  for (const [nodeId, nodeData] of nodeEntries) {
    const classType = String(nodeData.class_type || '');
    const inputs = nodeData.inputs as Record<string, unknown> | undefined;
    if (!inputs) continue;
    
    const newInputs: Record<string, unknown> = {};
    
    for (const [inputKey, inputValue] of Object.entries(inputs)) {
      if (typeof inputValue === 'string') {
        // 替换字符串中的占位符（可能返回数字或字符串）
        const replaced = replacePlaceholders(inputValue, params, templateDefaults);
        newInputs[inputKey] = replaced;
      } else if (Array.isArray(inputValue)) {
        // 处理数组
        newInputs[inputKey] = inputValue.map(v => {
          if (typeof v === 'string') {
            const replaced = replacePlaceholders(v, params, templateDefaults);
            return replaced;
          }
          return v;
        });
      } else {
        newInputs[inputKey] = inputValue;
      }
    }
    
    // 直接设置参数（覆盖占位符）
    if (params.width !== undefined && classType === 'EmptyLatentImage') {
      newInputs['width'] = params.width;
    }
    if (params.height !== undefined && classType === 'EmptyLatentImage') {
      newInputs['height'] = params.height;
    }
    if (params.steps !== undefined && classType === 'KSampler') {
      newInputs['steps'] = params.steps;
    }
    if (params.seed !== undefined && classType === 'KSampler') {
      newInputs['seed'] = params.seed;
    }
    if (params.cfg !== undefined && classType === 'KSampler') {
      newInputs['cfg'] = params.cfg;
    }
    if (params.denoise !== undefined && classType === 'KSampler') {
      newInputs['denoise'] = params.denoise;
    }
    if (params.model && classType === 'CheckpointLoaderSimple') {
      // 只有提供有效模型时才覆盖占位符
      newInputs['ckpt_name'] = params.model;
    }
    // LoraLoader 节点处理
    if (classType === 'LoraLoader') {
      // strength_model 强度
      if (params.lora_strength_model !== undefined) {
        newInputs['strength_model'] = params.lora_strength_model;
      } else if (workflow._loraStrengthModel !== undefined) {
        newInputs['strength_model'] = Number(workflow._loraStrengthModel);
      }
      // strength_clip 强度
      if (params.lora_strength_clip !== undefined) {
        newInputs['strength_clip'] = params.lora_strength_clip;
      } else if (workflow._loraStrengthClip !== undefined) {
        newInputs['strength_clip'] = Number(workflow._loraStrengthClip);
      }
    }
    // 如果 text 输入没有值，回退到 prompt 参数
    // 但只有当没有提供 negative_prompt 时才回退（模板期望单提示词场景）
    // 如果模板期望 negative_prompt 但没有对应占位符，应该保持 undefined 以便检测配置问题
    if (newInputs['text'] === undefined && params.prompt !== undefined && params.negative_prompt === undefined) {
      newInputs['text'] = params.prompt;
    }
    
    nodeData.inputs = newInputs;
  }
  
  return convertedNodes;
}

/**
 * 获取可用的工作流模板列表
 */
export function getAvailableTemplates(): WorkflowTemplate[] {
  const templates: WorkflowTemplate[] = [];
  
  try {
    if (!fs.existsSync(TEMPLATES_DIR)) {
      console.warn(`[WorkflowTemplate] Templates directory not found: ${TEMPLATES_DIR}`);
      return templates;
    }
    
    const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      const workflow = loadWorkflowTemplate(file);
      if (!workflow) continue;
      
      // 解析模板元数据
      templates.push({
        id: path.basename(file, '.json'),
        name: extractTemplateName(workflow) || path.basename(file, '.json'),
        description: extractTemplateDescription(workflow) || "",
        category: detectCategory(workflow),
        file,
        params: extractParams(workflow),
      });
    }
  } catch (error) {
    console.error(`[WorkflowTemplate] Failed to list templates:`, error);
  }
  
  return templates;
}

/**
 * 从工作流中提取模板名称
 */
function extractTemplateName(workflow: Record<string, unknown>): string | null {
  // 从子图 definitions 中提取
  const definitions = workflow.definitions as Record<string, unknown> | undefined;
  if (definitions?.subgraphs && Array.isArray(definitions.subgraphs)) {
    for (const subgraph of definitions.subgraphs as Array<{ name?: string }>) {
      if (subgraph.name) return subgraph.name;
    }
  }
  
  // 从节点标题提取
  const nodes = workflow.nodes as Array<{ title?: string; widgets_values?: unknown[] }> | undefined;
  for (const node of nodes || []) {
    if (node.title && !node.title.startsWith('Node')) {
      return node.title;
    }
  }
  
  return null;
}

/**
 * 从工作流中提取描述
 */
function extractTemplateDescription(workflow: Record<string, unknown>): string {
  const nodes = workflow.nodes as Array<{ title?: string; widgets_values?: unknown[]; type?: string }> | undefined;
  
  for (const node of nodes || []) {
    if (node.type === 'MarkdownNote' && Array.isArray(node.widgets_values)) {
      const text = node.widgets_values[0];
      if (typeof text === 'string') {
        // 提取第一段描述
        const match = text.match(/##\s*(.+?)\n/);
        if (match) return match[1].trim();
      }
    }
  }
  
  return "";
}

/**
 * 检测工作流类别
 */
function detectCategory(workflow: Record<string, unknown>): "image" | "video" | "i2v" {
  const workflowStr = JSON.stringify(workflow).toLowerCase();
  
  if (workflowStr.includes('videotoimage') || workflowStr.includes('i2v') || 
      workflowStr.includes('image_to_video') || workflowStr.includes('wan')) {
    return "video";
  }
  
  if (workflowStr.includes('imagetovideo') || workflowStr.includes('i2v')) {
    return "i2v";
  }
  
  return "image";
}

/**
 * 从工作流中提取可配置参数
 */
function extractParams(workflow: Record<string, unknown>): WorkflowTemplate['params'] {
  const params: WorkflowTemplate['params'] = {};
  
  // 从 definitions.subgraphs.inputs 提取
  const definitions = workflow.definitions as Record<string, unknown> | undefined;
  if (definitions?.subgraphs && Array.isArray(definitions.subgraphs)) {
    for (const subgraph of definitions.subgraphs as Array<{ inputs?: Array<{ name: string; type: string }> }>) {
      for (const input of subgraph.inputs || []) {
        if (input.type === 'INT' || input.type === 'FLOAT') {
          params[input.name] = { default: input.name === 'steps' ? 8 : input.name.includes('width') || input.name.includes('height') ? 1024 : 0 };
        }
      }
    }
  }
  
  // 从节点 widgets_values 提取默认值
  const nodes = workflow.nodes as Array<{ widgets_values?: unknown[]; inputs?: Array<{ name: string; type: string; link?: number | null }>; type?: string }> | undefined;
  
  for (const node of nodes || []) {
    if (node.type === 'KSampler' && Array.isArray(node.widgets_values)) {
      // KSampler: [seed, control_after_generate, steps, cfg, sampler_name, scheduler, denoise]
      if (node.widgets_values[2] !== undefined) {
        params['steps'] = { default: Number(node.widgets_values[2]), min: 1, max: 100, step: 1 };
      }
    }
    
    if ((node.type === 'EmptySD3LatentImage' || node.type === 'EmptyLatentImage') && Array.isArray(node.widgets_values)) {
      if (node.widgets_values[0] !== undefined) {
        params['width'] = { default: Number(node.widgets_values[0]), min: 256, max: 2048, step: 64 };
      }
      if (node.widgets_values[1] !== undefined) {
        params['height'] = { default: Number(node.widgets_values[1]), min: 256, max: 2048, step: 64 };
      }
    }
  }
  
  // 始终添加这些基本参数
  params['steps'] = params['steps'] || { default: 8, min: 1, max: 100, step: 1 };
  params['width'] = params['width'] || { default: 1024, min: 256, max: 2048, step: 64 };
  params['height'] = params['height'] || { default: 1024, min: 256, max: 2048, step: 64 };
  
  return params;
}
