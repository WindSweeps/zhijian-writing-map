/** Portable project storage. Documents stay as Markdown; PDF bytes are never rewritten. */
export type ProjectNode = {
  id: string;
  title: string;
  kind: "markdown" | "pdf";
  path: string;
  parentId: string | null;
  color: string | null;
  position: { x: number; y: number };
  page: number;
  note: string;
};

export type ProjectLink = { id: string; source: string; target: string; targetPage?: number; label: string };
export type Project = {
  format: "zhijian";
  version: 2;
  title: string;
  nodes: ProjectNode[];
  links: ProjectLink[];
  /** Non-node files bundled with the project, such as images and retained source files. */
  resources?: string[];
  view: { mode: "map" | "linear"; zoom: number };
  sideNote: string;
};
export type Workspace = {
  project: Project;
  documents: Record<string, string>;
  assets: Record<string, Blob>;
  warnings: string[];
};

export type WorkspaceFileHandle = {
  kind: "file";
  name: string;
  getFile(): Promise<File | Blob>;
  createWritable(): Promise<{ write(data: Blob | string): Promise<void>; close(): Promise<void>; abort?(): Promise<void> }>;
};
export type WorkspaceDirectoryHandle = {
  kind: "directory";
  name: string;
  values(): AsyncIterableIterator<WorkspaceDirectoryHandle | WorkspaceFileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<WorkspaceDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<WorkspaceFileHandle>;
};

const MANIFEST = "workspace.json";
const markdownPath = (path: string) => /\.(md|markdown)$/i.test(path);
const pdfPath = (path: string) => /\.pdf$/i.test(path);
const pathKey = (path: string) => path.normalize("NFC").toLocaleLowerCase("en-US");
const own = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function emptyWorkspace(): Workspace {
  return {
    project: { format: "zhijian", version: 2, title: "未命名工作区", nodes: [], links: [], resources: [], view: { mode: "map", zoom: 1 }, sideNote: "" },
    documents: {}, assets: {}, warnings: [],
  };
}

/** Reject paths that cannot be safely and portably written inside one selected folder. */
export function safePath(value: string): string {
  if (typeof value !== "string" || !value || value.startsWith("/") || /[\\\x00-\x1f\x7f:*?"<>|]/.test(value)) {
    throw new Error(`不安全的文件路径：${String(value)}`);
  }
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error(`不安全的文件路径：${value}`);
  }
  return value;
}

function ensureDistinctPaths(paths: Iterable<string>) {
  const used = new Map<string, string>();
  for (const path of paths) {
    safePath(path);
    const key = pathKey(path);
    const existing = used.get(key);
    if (existing !== undefined) throw new Error(`文件路径重复或大小写冲突：${existing} / ${path}`);
    used.set(key, path);
  }
  for (const [key, original] of used) {
    const parts = key.split("/");
    for (let index = 1; index < parts.length; index++) {
      const prefix = parts.slice(0, index).join("/");
      if (used.has(prefix)) throw new Error(`文件与文件夹路径冲突：${used.get(prefix)} / ${original}`);
    }
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label}必须是文本`);
  return value;
}

function requireId(value: unknown, label: string): string {
  const id = requireString(value, label);
  if (!id.trim() || /[\x00-\x1f]/.test(id)) throw new Error(`${label}不能为空或包含控制字符`);
  return id;
}

function requirePage(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(`${label}必须是正整数`);
  return value;
}

export function validateProject(value: unknown): Project {
  if (!record(value) || value.format !== "zhijian" || value.version !== 2) throw new Error("workspace.json 格式不受支持（需要枝间 v2 工程）");
  if (!Array.isArray(value.nodes) || !Array.isArray(value.links)) throw new Error("工程缺少 nodes 或 links 数组");
  const ids = new Set<string>();
  const nodes = value.nodes.map((item, index): ProjectNode => {
    if (!record(item)) throw new Error(`第 ${index + 1} 个节点格式错误`);
    const id = requireId(item.id, "节点 ID");
    if (ids.has(id)) throw new Error(`节点 ID 重复：${id}`);
    ids.add(id);
    if (item.kind !== "markdown" && item.kind !== "pdf") throw new Error(`节点类型无效：${id}`);
    const path = safePath(requireString(item.path, "节点路径"));
    if ((item.kind === "markdown" && !markdownPath(path)) || (item.kind === "pdf" && !pdfPath(path))) throw new Error(`节点类型与扩展名不一致：${path}`);
    const parentId = item.parentId === null ? null : requireId(item.parentId, "父节点 ID");
    const color = item.color === null ? null : requireString(item.color, "分支颜色");
    if (color !== null && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`分支颜色无效：${id}`);
    if (!record(item.position) || typeof item.position.x !== "number" || typeof item.position.y !== "number" || !Number.isFinite(item.position.x) || !Number.isFinite(item.position.y)) throw new Error(`节点坐标无效：${id}`);
    return { id, title: requireString(item.title, "节点标题"), kind: item.kind, path, parentId, color, position: { x: item.position.x, y: item.position.y }, page: requirePage(item.page, "PDF 页码"), note: requireString(item.note, "节点旁注") };
  });
  if (value.resources !== undefined && !Array.isArray(value.resources)) throw new Error("工程 resources 必须是文件路径数组");
  const resources = (value.resources ?? []).map((path: unknown) => safePath(requireString(path, "资源路径")));
  ensureDistinctPaths([MANIFEST, ...nodes.map((node) => node.path), ...resources]);
  const parents = new Map(nodes.map((node) => [node.id, node.parentId]));
  const checked = new Set<string>();
  for (const node of nodes) {
    if (node.parentId !== null && !ids.has(node.parentId)) throw new Error(`父节点不存在：${node.parentId}`);
    const chain = new Set<string>();
    let current: string | null = node.id;
    while (current !== null && !checked.has(current)) {
      if (chain.has(current)) throw new Error(`父子关系形成循环：${node.id}`);
      chain.add(current);
      current = parents.get(current) ?? null;
    }
    for (const id of chain) checked.add(id);
  }
  const linkIds = new Set<string>();
  const links = value.links.map((item): ProjectLink => {
    if (!record(item)) throw new Error("连线格式错误");
    const id = requireId(item.id, "连线 ID");
    if (linkIds.has(id)) throw new Error(`连线 ID 重复：${id}`);
    linkIds.add(id);
    const source = requireId(item.source, "连线起点");
    const target = requireId(item.target, "连线终点");
    if (!ids.has(source) || !ids.has(target)) throw new Error(`连线指向不存在的节点：${id}`);
    const link: ProjectLink = { id, source, target, label: requireString(item.label, "连线说明") };
    if (item.targetPage !== undefined) {
      link.targetPage = requirePage(item.targetPage, "引用页码");
      if (nodes.find((node) => node.id === target)?.kind !== "pdf") throw new Error(`只有 PDF 引用可以指定页码：${id}`);
    }
    return link;
  });
  if (!record(value.view) || (value.view.mode !== "map" && value.view.mode !== "linear") || typeof value.view.zoom !== "number" || !Number.isFinite(value.view.zoom) || value.view.zoom <= 0) throw new Error("工程视图设置无效");
  return { format: "zhijian", version: 2, title: requireString(value.title, "工程标题"), nodes, links, resources, view: { mode: value.view.mode, zoom: value.view.zoom }, sideNote: requireString(value.sideNote, "工程旁注") };
}

function markdownTargets(body: string): string[] {
  const source = body.replace(/^\s*(```+|~~~+)[\s\S]*?^\s*\1\s*$/gm, "").replace(/`[^`\n]*`/g, "");
  const targets: string[] = [];
  const inline = /\]\(\s*(?:<([^>\n]+)>|((?:\\.|[^()\s]|\([^)]*\))+))/g;
  const reference = /^\s{0,3}\[[^\]\n]+\]:\s*(?:<([^>\n]+)>|(\S+))/gm;
  const html = /<(?:img|a|source)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi;
  for (const pattern of [inline, reference]) for (const match of source.matchAll(pattern)) targets.push(match[1] ?? match[2]);
  for (const match of source.matchAll(html)) targets.push(match[1]);
  return targets;
}

function resolveTarget(documentPath: string, destination: string): { path: string; page?: number } | null {
  if (!destination || /^[a-z][a-z\d+.-]*:/i.test(destination) || destination.startsWith("//") || destination.startsWith("#")) return null;
  const fragment = decodeURIComponent(destination.split("#")[1] ?? "");
  const query = destination.split("#")[0].split("?")[1] ?? "";
  const pageValue = new URLSearchParams(fragment).get("page") || new URLSearchParams(query).get("page");
  const page = pageValue && /^\d+$/.test(pageValue) && Number.isSafeInteger(Number(pageValue)) && Number(pageValue) > 0 ? Number(pageValue) : undefined;
  const rawPath = decodeURIComponent(destination.split(/[?#]/)[0].replace(/\\([()\[\] ])/g, "$1"));
  if (!rawPath || rawPath.startsWith("//") || rawPath.includes("\\")) throw new Error(`引用路径不在工作区内：${destination}`);
  // Root-relative Markdown URLs refer to the selected project, never the OS filesystem.
  const parts = rawPath.startsWith("/") ? [] : documentPath.split("/").slice(0, -1);
  for (const part of rawPath.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) throw new Error(`引用路径超出工作区：${destination}`);
      parts.pop();
    } else parts.push(part);
  }
  const path = safePath(parts.join("/"));
  if (pathKey(path) === MANIFEST) throw new Error("Markdown 不能把 workspace.json 当作内容文件引用");
  return { path, ...(page ? { page } : {}) };
}

function titleFromMarkdown(body: string, path: string): string {
  return /^\s{0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/m.exec(body)?.[1] ?? path.split("/").pop()!.replace(/\.(markdown|md|pdf)$/i, "");
}

async function readMarkdown(file: Blob): Promise<string> {
  // Blob.text() strips a UTF-8 BOM; ignoreBOM preserves it along with CRLF and trailing newlines.
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer());
}

function relativeTarget(from: string, to: string): string {
  const directory = from.split("/").slice(0, -1);
  const target = to.split("/");
  while (directory.length && target.length && directory[0] === target[0]) { directory.shift(); target.shift(); }
  return [...directory.map(() => ".."), ...target.map((part) => encodeURIComponent(part))].join("/");
}

type LegacyBlock = Record<string, unknown>;
function migrateLegacy(value: Record<string, unknown>): { project: Project; blocks: LegacyBlock[] } {
  if (!Array.isArray(value.blocks)) throw new Error("旧版工程缺少 blocks 数组");
  const blocks = value.blocks.map((block) => {
    if (!record(block)) throw new Error("旧版内容块格式错误");
    return block;
  });
  const project = emptyWorkspace().project;
  project.title = typeof value.title === "string" ? value.title : project.title;
  project.sideNote = typeof value.sideNote === "string" ? value.sideNote : "";
  if (record(value.view)) project.view.mode = value.view.mode === "linear" ? "linear" : "map";
  project.nodes = blocks.map((block, index) => {
    const id = requireId(block.id, "旧版内容块 ID");
    const fallbackIndex = String(index + 1).padStart(2, "0");
    const path = typeof block.bodyFile === "string" ? block.bodyFile : `content/${typeof block.index === "string" ? block.index : fallbackIndex}-${id}.md`;
    const notes: string[] = [];
    if (typeof block.eyebrow === "string" && block.eyebrow) notes.push(block.eyebrow);
    if (typeof block.quote === "string" && block.quote) notes.push(`引用摘录\n${block.quote}`);
    if (record(block.ref)) {
      if (typeof block.ref.label === "string") notes.push(block.ref.label);
      if (typeof block.ref.url === "string") notes.push(block.ref.url);
      if (typeof block.ref.note === "string") notes.push(block.ref.note);
    }
    if (typeof block.imagePath === "string") notes.push(`配图：![配图](<${relativeTarget(path, safePath(block.imagePath))}>)`);
    else if (typeof block.image === "string") notes.push(`配图：${block.image}`);
    return { id, title: typeof block.title === "string" ? block.title : "未命名内容块", kind: "markdown", path, parentId: null, color: record(value.view) && typeof value.view.branchColor === "string" && /^#[\da-f]{6}$/i.test(value.view.branchColor) ? value.view.branchColor : null, position: { x: 100 + (index % 3) * 320, y: 100 + Math.floor(index / 3) * 220 }, page: 1, note: notes.join("\n\n") };
  });
  return { project: validateProject(project), blocks };
}

export async function loadWorkspace(files: Map<string, File | Blob>, title?: string): Promise<Workspace> {
  ensureDistinctPaths(files.keys());
  const alternateManifest = [...files.keys()].find((path) => pathKey(path) === MANIFEST && path !== MANIFEST);
  if (alternateManifest) throw new Error(`工程文件名称必须是 workspace.json：${alternateManifest}`);
  const workspace = emptyWorkspace();
  workspace.documents = Object.create(null) as Record<string, string>;
  workspace.assets = Object.create(null) as Record<string, Blob>;
  if (title) workspace.project.title = title;
  let legacyBlocks: LegacyBlock[] | undefined;
  let discovering = false;
  const manifest = files.get(MANIFEST);
  if (manifest) {
    let raw: unknown;
    try { raw = JSON.parse(await manifest.text()); } catch { throw new Error("workspace.json 不是有效的 JSON 文件"); }
    if (record(raw) && raw.version === 1) {
      const legacy = migrateLegacy(raw);
      workspace.project = legacy.project;
      legacyBlocks = legacy.blocks;
      workspace.warnings.push("已导入 v1 工作区；保存时将升级为 v2，旧版引用、配图路径与摘录保留在节点旁注中。");
    } else workspace.project = validateProject(raw);
  } else {
    discovering = true;
    const paths = [...files.keys()].filter((path) => markdownPath(path) || pdfPath(path)).sort((a, b) => a.localeCompare(b));
    workspace.project.nodes = paths.map((path, index) => ({ id: `document-${index + 1}`, title: titleFromMarkdown("", path), kind: pdfPath(path) ? "pdf" : "markdown", path, parentId: null, color: null, position: { x: 100 + (index % 3) * 320, y: 100 + Math.floor(index / 3) * 220 }, page: 1, note: "" }));
  }
  const warn = (message: string) => { if (!workspace.warnings.includes(message)) workspace.warnings.push(message); };
  const pending: { path: string; text: string; nodeId?: string }[] = [];
  const visited = new Set<string>();
  for (const path of workspace.project.resources ?? []) {
    const file = files.get(path);
    if (!file) { warn(`缺少资源：${path}。补回文件后再保存，避免丢失工程附件。`); continue; }
    workspace.assets[path] = file;
    if (markdownPath(path)) {
      try { pending.push({ path, text: await readMarkdown(file) }); } catch { warn(`无法读取资源正文：${path}，原始文件仍保留。`); }
    }
  }
  for (const node of workspace.project.nodes) {
    const file = files.get(node.path);
    if (!file) {
      const block = legacyBlocks?.find((item) => item.id === node.id);
      if (node.kind === "markdown" && block && typeof block.body === "string") {
        workspace.documents[node.id] = block.body;
        pending.push({ path: node.path, text: `${block.body}\n\n${node.note}`, nodeId: node.id });
      } else warn(`缺少文件：${node.path}。补回文件后再保存，避免覆盖缺失内容。`);
      continue;
    }
    if (node.kind === "pdf") {
      workspace.assets[node.path] = file;
      if (node.note) pending.push({ path: node.path, text: node.note, nodeId: node.id });
    }
    else {
      try {
        const text = await readMarkdown(file);
        workspace.documents[node.id] = text;
        pending.push({ path: node.path, text: `${text}\n\n${node.note}`, nodeId: node.id });
        if (discovering) node.title = titleFromMarkdown(text, node.path);
      } catch { warn(`无法读取文件：${node.path}。补回文件后再保存。`); }
    }
  }
  for (const block of legacyBlocks ?? []) if (typeof block.imagePath === "string") {
    const path = safePath(block.imagePath);
    if (pathKey(path) === MANIFEST) throw new Error("旧版配图不能使用 workspace.json 路径");
    const file = files.get(path);
    if (file) workspace.assets[path] = file;
    else warn(`缺少配图：${path}`);
  }
  const byPath = new Map(workspace.project.nodes.map((node) => [node.path, node]));
  while (pending.length) {
    const document = pending.shift()!;
    if (visited.has(document.path)) continue;
    visited.add(document.path);
    for (const destination of markdownTargets(document.text)) {
      let target: ReturnType<typeof resolveTarget>;
      try { target = resolveTarget(document.path, destination); } catch (error) { warn((error as Error).message); continue; }
      if (!target) continue;
      const file = files.get(target.path);
      if (!file) { warn(`引用文件不存在：${document.path} → ${target.path}`); continue; }
      const node = byPath.get(target.path);
      if (!node || node.kind === "pdf") workspace.assets[target.path] = file;
      if (discovering && document.nodeId && node && node.id !== document.nodeId && !workspace.project.links.some((link) => link.source === document.nodeId && link.target === node.id && link.targetPage === (node.kind === "pdf" ? target.page : undefined))) {
        workspace.project.links.push({ id: `link-${workspace.project.links.length + 1}`, source: document.nodeId, target: node.id, label: node.kind === "pdf" ? "参考资料" : "关联笔记", ...(node.kind === "pdf" && target.page ? { targetPage: target.page } : {}) });
      }
      if (!node && markdownPath(target.path) && !visited.has(target.path)) {
        try { pending.push({ path: target.path, text: await readMarkdown(file) }); } catch { warn(`无法读取引用文件：${target.path}`); }
      }
    }
  }
  const nodePaths = new Set(workspace.project.nodes.map((node) => node.path));
  workspace.project.resources = [...new Set([...(workspace.project.resources ?? []), ...Object.keys(workspace.assets).filter((path) => !nodePaths.has(path))])];
  workspace.project = validateProject(workspace.project);
  return workspace;
}

export async function serializeWorkspace(workspace: Workspace): Promise<Map<string, Blob>> {
  const project = validateProject(workspace.project);
  const files = new Map<string, Blob>();
  const nodePaths = new Map(project.nodes.map((node) => [node.path, node]));
  for (const path of project.resources ?? []) if (!own(workspace.assets, path)) throw new Error(`缺少资源，未执行保存：${path}`);
  for (const [path, blob] of Object.entries(workspace.assets)) {
    safePath(path);
    if (pathKey(path) === MANIFEST) throw new Error("资源不能覆盖 workspace.json");
    if (!(blob instanceof Blob)) throw new Error(`资源不是有效文件：${path}`);
    if (nodePaths.get(path)?.kind === "markdown") throw new Error(`Markdown 内容与资源路径冲突：${path}`);
    files.set(path, blob);
  }
  for (const node of project.nodes) {
    if (node.kind === "markdown") {
      if (!own(workspace.documents, node.id) || typeof workspace.documents[node.id] !== "string") throw new Error(`缺少正文，未执行保存：${node.path}`);
      files.set(node.path, new Blob([workspace.documents[node.id]], { type: "text/markdown;charset=utf-8" }));
    } else if (!files.has(node.path)) throw new Error(`缺少 PDF，未执行保存：${node.path}`);
  }
  project.resources = Object.keys(workspace.assets).filter((path) => !nodePaths.has(path));
  validateProject(project);
  files.set(MANIFEST, new Blob([`${JSON.stringify(project, null, 2)}\n`], { type: "application/json;charset=utf-8" }));
  ensureDistinctPaths(files.keys());
  return files;
}

export async function readDirectory(handle: WorkspaceDirectoryHandle): Promise<Map<string, Blob>> {
  const files = new Map<string, Blob>();
  const visit = async (directory: WorkspaceDirectoryHandle, prefix: string) => {
    for await (const entry of directory.values()) {
      if ([".git", "node_modules", ".next", ".DS_Store"].includes(entry.name)) continue;
      if (entry.name.includes("/") || entry.name.includes("\\")) throw new Error(`文件名无效：${entry.name}`);
      const path = safePath(`${prefix}${entry.name}`);
      if (entry.kind === "directory") await visit(entry, `${path}/`);
      else {
        if (files.has(path)) throw new Error(`重复文件：${path}`);
        files.set(path, await entry.getFile());
      }
    }
  };
  await visit(handle, "");
  ensureDistinctPaths(files.keys());
  return files;
}

export async function saveDirectory(handle: WorkspaceDirectoryHandle, workspace: Workspace): Promise<void> {
  // Validate the entire output before creating directories or touching existing files.
  const files = await serializeWorkspace(workspace);
  // Inspect names without reading unrelated file contents, including case collisions on macOS/Windows.
  const existing: string[] = [];
  const inspect = async (directory: WorkspaceDirectoryHandle, prefix: string) => {
    for await (const entry of directory.values()) {
      const path = `${prefix}${entry.name}`;
      if (entry.kind === "directory") {
        if ([...files.keys()].some((output) => pathKey(output).startsWith(`${pathKey(path)}/`) || pathKey(output) === pathKey(path))) {
          if ([...files.keys()].some((output) => pathKey(output) === pathKey(path))) throw new Error(`目标路径已是文件夹：${path}`);
          const expectedPrefix = [...files.keys()].find((output) => pathKey(output).startsWith(`${pathKey(path)}/`))!.split("/").slice(0, path.split("/").length).join("/");
          if (expectedPrefix !== path) throw new Error(`目标文件夹大小写冲突：${path} / ${expectedPrefix}`);
          await inspect(entry, `${path}/`);
        }
      } else existing.push(path);
    }
  };
  await inspect(handle, "");
  for (const path of files.keys()) for (const old of existing) {
    if (pathKey(old) === pathKey(path) && old !== path) throw new Error(`目标文件大小写冲突：${old} / ${path}`);
    if (pathKey(path).startsWith(`${pathKey(old)}/`)) throw new Error(`目标父路径已是文件：${old}`);
  }
  for (const [path, blob] of files) {
    const parts = path.split("/");
    const filename = parts.pop()!;
    let directory = handle;
    for (const part of parts) directory = await directory.getDirectoryHandle(part, { create: true });
    const file = await directory.getFileHandle(filename, { create: true });
    const stream = await file.createWritable();
    try { await stream.write(blob); await stream.close(); }
    catch (error) { try { await stream.abort?.(); } catch { /* Preserve the original write error. */ } throw error; }
  }
}
