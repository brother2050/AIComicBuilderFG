/**
 * ComfyUI 工作流模板管理
 * 加载 JSON 文件并转换为 API 格式
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
  first_frame?: string;
  last_frame?: string;
  duration?: number;
  frame_length?: number;
  cfg?: number;
  denoise?: number;
  model?: string;
  vae?: string;
  clip?: string;
  lora?: string;
  lora_strength_model?: number;
  lora_strength_clip?: number;
  forcePrompt?: boolean; // 强制使用 prompt 覆盖工作流默认文本
  [key: string]: string | number | boolean | undefined;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: "image" | "video" | "i2v";
  file: string;
  params: Record<string, { default: number }>;
}

/**
 * 加载工作流模板 JSON
 */
export function loadWorkflowTemplate(filename: string): Record<string, unknown> | null {
  try {
    const filepath = path.join(TEMPLATES_DIR, filename);
    if (!fs.existsSync(filepath)) {
      console.warn(`[WorkflowTemplate] Not found: ${filepath}`);
      return null;
    }
    return JSON.parse(fs.readFileSync(filepath, "utf-8"));
  } catch (error) {
    console.error(`[WorkflowTemplate] Load failed ${filename}:`, error);
    return null;
  }
}

/**
 * 加载项目工作流，支持模板文件或直接配置
 */
export function loadProjectWorkflow(workflowConfig: string | null): Record<string, unknown> | null {
  if (!workflowConfig) return null;

  try {
    const config = JSON.parse(workflowConfig) as Record<string, unknown>;

    // 直接是工作流对象
    if (config._workflowFile === undefined) {
      return config;
    }

    // 引用模板文件
    const templateFile = String(config._workflowFile);
    const template = loadWorkflowTemplate(templateFile);
    if (!template) return null;

    // 子图格式不支持 API，尝试 _api.json
    if ((template.definitions as Record<string, unknown>)?.subgraphs) {
      const apiVersion = templateFile.replace('.json', '_api.json');
      const apiTemplate = loadWorkflowTemplate(apiVersion);
      if (apiTemplate) {
        console.log(`[WorkflowTemplate] Using API workflow: ${apiVersion}`);
        return mergeWorkflowConfig(apiTemplate, config);
      }
      // 回退到默认模板
      const fallback = loadWorkflowTemplate('image_z_image_turbo.json');
      if (fallback) {
        console.log(`[WorkflowTemplate] Falling back to image_z_image_turbo.json`);
        return mergeWorkflowConfig(fallback, config);
      }
      return null;
    }

    return mergeWorkflowConfig(template, config);
  } catch (e) {
    console.warn(`[WorkflowTemplate] Parse failed:`, e);
    return null;
  }
}

/** 合并模板和配置 */
function mergeWorkflowConfig(template: Record<string, unknown>, config: Record<string, unknown>): Record<string, unknown> {
  return {
    ...template,
    _config: {
      width: Number(config._width) || 1024,
      height: Number(config._height) || 1024,
      steps: Number(config._steps) || 8,
      model: config._model as string | undefined,
    }
  };
}

/**
 * 提取工作流节点（支持多种格式）
 * 返回格式: { nodeId: { class_type, inputs } }
 */
function extractNodes(workflow: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};

  // 跳过元数据字段
  const skipKeys = new Set(['id', 'last_node_id', 'last_link_id', 'definitions', '_config']);

  for (const [key, value] of Object.entries(workflow)) {
    if (skipKeys.has(key)) continue;
    if (typeof value === 'object' && value !== null && 'class_type' in value) {
      result[key] = value as Record<string, unknown>;
    }
  }

  return result;
}

/**
 * 应用参数到工作流
 */
export function applyWorkflowParams(
  workflow: Record<string, unknown>,
  params: WorkflowParams
): Record<string, Record<string, unknown>> {
  const defaults = {
    model: workflow._defaultModel as string | undefined,
    vae: workflow._defaultVAE as string | undefined,
    clip: workflow._defaultCLIP as string | undefined,
    lora: workflow._defaultLora as string | undefined,
  };

  const nodes = extractNodes(workflow);

  for (const [nodeId, nodeData] of Object.entries(nodes)) {
    const classType = String(nodeData.class_type || '');
    const inputs = (nodeData.inputs as Record<string, unknown>) || {};
    const newInputs: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(inputs)) {
      if (typeof value === 'string') {
        newInputs[key] = replacePlaceholder(value, params, defaults);
      } else if (Array.isArray(value)) {
        newInputs[key] = value.map(v => typeof v === 'string' ? replacePlaceholder(v, params, defaults) : v);
      } else {
        newInputs[key] = value;
      }
    }

    // 根据节点类型设置参数
    applyNodeParams(newInputs, classType, params);
    nodeData.inputs = newInputs;
  }

  return nodes;
}

/** 替换占位符 */
function replacePlaceholder(
  text: string,
  params: WorkflowParams,
  defaults: Record<string, string | undefined>
): string | number {
  // 数字占位符 __NUM:name__
  const numMatch = text.match(/^__NUM:(\w+)__$/);
  if (numMatch) {
    const value = params[numMatch[1] as keyof WorkflowParams];
    return value !== undefined ? Number(value) : text;
  }

  // 模型占位符
  if (text === '__MODEL__') {
    return params.model || defaults.model || '';
  }
  if (text === '__VAE__') {
    return params.vae || defaults.vae || '';
  }
  if (text === '__CLIP__') {
    return params.clip || defaults.clip || '';
  }
  if (text === '__LORA__') {
    return params.lora || defaults.lora || '';
  }

  // {{key}} 格式占位符
  let result = text;
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
    }
  }
  return result;
}

/** 根据节点类型应用参数 */
function applyNodeParams(inputs: Record<string, unknown>, classType: string, params: WorkflowParams): void {
  switch (classType) {
    case 'EmptyLatentImage':
      if (params.width !== undefined) inputs['width'] = params.width;
      if (params.height !== undefined) inputs['height'] = params.height;
      break;
    case 'KSampler':
      if (params.steps !== undefined) inputs['steps'] = params.steps;
      if (params.seed !== undefined) inputs['seed'] = params.seed;
      if (params.cfg !== undefined) inputs['cfg'] = params.cfg;
      if (params.denoise !== undefined) inputs['denoise'] = params.denoise;
      break;
    case 'CheckpointLoaderSimple':
      if (params.model) inputs['ckpt_name'] = params.model;
      break;
    case 'LoraLoader':
      if (params.lora_strength_model !== undefined) inputs['strength_model'] = params.lora_strength_model;
      if (params.lora_strength_clip !== undefined) inputs['strength_clip'] = params.lora_strength_clip;
      break;
  }

  // 默认文本填充
  // forcePrompt 为 true 时，无论工作流中是否有默认文本，都强制使用 params.prompt
  const forcePrompt = params.forcePrompt === true;
  if ((inputs['text'] === undefined || forcePrompt) && params.prompt !== undefined) {
    inputs['text'] = params.prompt;
  }
}

/**
 * 获取可用模板列表
 */
export function getAvailableTemplates(): WorkflowTemplate[] {
  try {
    if (!fs.existsSync(TEMPLATES_DIR)) return [];

    return fs.readdirSync(TEMPLATES_DIR)
      .filter(f => f.endsWith('.json'))
      .map(file => {
        const workflow = loadWorkflowTemplate(file)!;
        return {
          id: file.replace('.json', ''),
          name: extractTemplateName(workflow) || file.replace('.json', ''),
          description: extractTemplateDescription(workflow) || '',
          category: detectCategory(workflow),
          file,
          params: extractParams(workflow),
        };
      });
  } catch (error) {
    console.error(`[WorkflowTemplate] List failed:`, error);
    return [];
  }
}

function extractTemplateName(workflow: Record<string, unknown>): string | null {
  // 从节点标题提取
  const nodes = workflow.nodes as Array<{ title?: string }> | undefined;
  for (const node of nodes || []) {
    if (node.title && !node.title.startsWith('Node')) {
      return node.title;
    }
  }
  return null;
}

function extractTemplateDescription(workflow: Record<string, unknown>): string {
  const nodes = workflow.nodes as Array<{ type?: string; widgets_values?: unknown[] }> | undefined;
  for (const node of nodes || []) {
    if (node.type === 'MarkdownNote' && Array.isArray(node.widgets_values)) {
      const text = node.widgets_values[0];
      if (typeof text === 'string') {
        const match = text.match(/##\s*(.+?)\n/);
        if (match) return match[1].trim();
      }
    }
  }
  return '';
}

function detectCategory(workflow: Record<string, unknown>): "image" | "video" | "i2v" {
  const str = JSON.stringify(workflow).toLowerCase();
  if (str.includes('wan') || str.includes('i2v') || str.includes('image_to_video')) return "video";
  if (str.includes('videotoimage')) return "i2v";
  return "image";
}

function extractParams(workflow: Record<string, unknown>): WorkflowTemplate['params'] {
  const params: WorkflowTemplate['params'] = { steps: { default: 8 }, width: { default: 1024 }, height: { default: 1024 } };

  // 方式1: nodes 数组格式
  const nodesArray = workflow.nodes as Array<{ type?: string; widgets_values?: unknown[] }> | undefined;
  for (const node of nodesArray || []) {
    if (node.type === 'KSampler' && Array.isArray(node.widgets_values)) {
      if (node.widgets_values[2] !== undefined) params['steps'] = { default: Number(node.widgets_values[2]) };
    }
    if ((node.type === 'EmptySD3LatentImage' || node.type === 'EmptyLatentImage') && Array.isArray(node.widgets_values)) {
      if (node.widgets_values[0] !== undefined) params['width'] = { default: Number(node.widgets_values[0]) };
      if (node.widgets_values[1] !== undefined) params['height'] = { default: Number(node.widgets_values[1]) };
    }
  }

  // 方式2: 节点ID作为键的格式 (如 "57:3": { inputs: { steps: 8 } })
  const nodesObj = workflow as Record<string, unknown>;
  for (const [key, value] of Object.entries(nodesObj)) {
    if (typeof value !== 'object' || value === null) continue;
    const node = value as Record<string, unknown>;
    const classType = node.class_type as string | undefined;
    const inputs = node.inputs as Record<string, unknown> | undefined;
    if (!inputs) continue;

    if (classType === 'KSampler') {
      if (inputs.steps !== undefined) params['steps'] = { default: Number(inputs.steps) };
    }
    if (classType === 'EmptySD3LatentImage' || classType === 'EmptyLatentImage') {
      if (inputs.width !== undefined) params['width'] = { default: Number(inputs.width) };
      if (inputs.height !== undefined) params['height'] = { default: Number(inputs.height) };
    }
  }

  return params;
}

/**
 * 从工作流提取完整默认参数
 */
export interface WorkflowDefaults {
  width: number;
  height: number;
  steps: number;
  cfg: number;
  denoise: number;
  seed: number;
  sampler_name: string;
  scheduler: string;
  model: string;
  vae: string;
  clip: string;
}

export function getWorkflowDefaults(workflow: Record<string, unknown>): WorkflowDefaults {
  const defaults: WorkflowDefaults = {
    width: 1024,
    height: 1024,
    steps: 8,
    cfg: 1,
    denoise: 1,
    seed: Math.floor(Math.random() * 99999999999999),
    sampler_name: "res_multistep",
    scheduler: "simple",
    model: "",
    vae: "",
    clip: "",
  };

  const nodesObj = workflow as Record<string, unknown>;
  for (const [key, value] of Object.entries(nodesObj)) {
    if (typeof value !== 'object' || value === null) continue;
    const node = value as Record<string, unknown>;
    const classType = node.class_type as string | undefined;
    const inputs = node.inputs as Record<string, unknown> | undefined;
    if (!inputs) continue;

    if (classType === 'KSampler') {
      if (inputs.steps !== undefined) defaults.steps = Number(inputs.steps);
      if (inputs.cfg !== undefined) defaults.cfg = Number(inputs.cfg);
      if (inputs.denoise !== undefined) defaults.denoise = Number(inputs.denoise);
      if (inputs.seed !== undefined) defaults.seed = Number(inputs.seed);
      if (inputs.sampler_name !== undefined) defaults.sampler_name = String(inputs.sampler_name);
      if (inputs.scheduler !== undefined) defaults.scheduler = String(inputs.scheduler);
    }
    if (classType === 'EmptySD3LatentImage' || classType === 'EmptyLatentImage') {
      if (inputs.width !== undefined) defaults.width = Number(inputs.width);
      if (inputs.height !== undefined) defaults.height = Number(inputs.height);
    }
    if (classType === 'UNETLoader' || classType === 'CheckpointLoaderSimple') {
      const unetName = inputs.unet_name || inputs.ckpt_name;
      if (unetName !== undefined) defaults.model = String(unetName);
    }
    if (classType === 'VAELoader') {
      const vaeName = inputs.vae_name;
      if (vaeName !== undefined) defaults.vae = String(vaeName);
    }
    if (classType === 'CLIPLoader') {
      const clipName = inputs.clip_name;
      if (clipName !== undefined) defaults.clip = String(clipName);
    }
  }

  return defaults;
}
