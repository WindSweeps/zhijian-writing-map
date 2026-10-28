"use client";

import { useEffect, useRef, useState } from "react";
import { zip, unzipSync } from "fflate";
import { MarkdownPreview, PDFReader } from "./components/DocumentView";
import { emptyWorkspace, loadWorkspace, readDirectory, saveDirectory, serializeWorkspace, safePath, type Workspace, type ProjectNode, type Project, type WorkspaceDirectoryHandle } from "../lib/workspace";

const palette = ["#427261", "#a3643e", "#496fa3", "#816497", "#a35760"];
type Directory = WorkspaceDirectoryHandle & { name: string; requestPermission?: (options: { mode: "readwrite" }) => Promise<string> };
type LocalWindow = Window & { showDirectoryPicker?: (options: { mode: "readwrite" }) => Promise<Directory> };
const uid = () => crypto.randomUUID();
const fileName = (path: string) => path.split("/").pop() || path;

function Icon({ name }: { name: "map" | "file" | "folder" | "save" | "plus" | "link" | "arrow" | "download" | "close" | "search" }) {
  const paths = { map: "M4 5h5v5H4zM15 14h5v5h-5zM15 3h5v5h-5zM9 7h3v10h3M12 5h3", file: "M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6", folder: "M3 6h7l2 3h9v11H3zM3 6V4h7l2 2h8v3", save: "M4 3h14l3 3v15H3V3zM7 3v6h10V3M7 21v-8h10v8", plus: "M12 5v14M5 12h14", link: "M10 14l4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M13 17a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1", arrow: "M5 12h14M13 6l6 6-6 6", download: "M12 3v12M7 10l5 5 5-5M4 17v4h16v-4", close: "M6 6l12 12M6 18L18 6", search: "M15 15l6 6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0" };
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

function colorOf(node: ProjectNode, nodes: ProjectNode[]): string {
  let current: ProjectNode | undefined = node;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    if (current.color) return current.color;
    seen.add(current.id);
    current = nodes.find(n => n.id === current?.parentId);
  }
  return palette[0];
}

export default function Home() {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [directoryName, setDirectoryName] = useState("");
  const [search, setSearch] = useState("");
  const [editorMode, setEditorMode] = useState<"edit" | "preview">("edit");
  const [inspectorTab, setInspectorTab] = useState<"content" | "relations">("content");
  const [linkTarget, setLinkTarget] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkPage, setLinkPage] = useState(1);
  const [mobilePane, setMobilePane] = useState<"files" | "map" | "reader">("map");
  const directory = useRef<Directory | null>(null);
  const currentWorkspace = useRef(workspace);
  currentWorkspace.current = workspace;
  const importInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const archiveInput = useRef<HTMLInputElement>(null);
  const revision = useRef(0);
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; clientX: number; clientY: number; x: number; y: number } | null>(null);
  const { project } = workspace;
  const nodes = project.nodes;
  const active = nodes.find(n => n.id === activeId);
  const activeLinks = project.links.filter(l => l.source === activeId || l.target === activeId);
  const filtered = nodes.filter(n => `${n.title} ${n.path}`.toLowerCase().includes(search.toLowerCase()));
  const zoom = project.view.zoom;
  const mapWidth = Math.max(920, ...nodes.map(n => n.position.x * zoom + 320));
  const mapHeight = Math.max(620, ...nodes.map(n => n.position.y * zoom + 200));

  useEffect(() => {
    const preventLoss = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty]);

  function change(update: (old: Workspace) => Workspace) {
    revision.current += 1;
    setWorkspace(update);
    setDirty(true);
    setNotice("");
  }
  function updateProject(patch: Partial<Project>) { change(w => ({ ...w, project: { ...w.project, ...patch } })); }
  function updateNode(id: string, patch: Partial<ProjectNode>) { change(w => ({ ...w, project: { ...w.project, nodes: w.project.nodes.map(n => n.id === id ? { ...n, ...patch } : n) } })); }
  function selectNode(id: string, page?: number) {
    setActiveId(id); setInspectorTab("content"); setLinkTarget(""); setMobilePane("reader");
    if (page) updateNode(id, { page });
  }
  function handleError(value: unknown) {
    if (value instanceof Error && value.name === "AbortError") return;
    setError(value instanceof Error ? value.message : String(value));
  }
  function discardConfirmed() { return !dirty || window.confirm("当前修改尚未保存。继续将关闭当前工程，是否继续？"); }
  function activate(next: Workspace, handle: Directory | null = null, isDirty = false) {
    directory.current = handle;
    setDirectoryName(handle?.name || ""); setWorkspace(next); revision.current += 1;
    setDirty(isDirty); setActiveId(next.project.nodes[0]?.id || null); setInspectorTab("content"); setSearch(""); setError("");
    setNotice(next.warnings.length ? next.warnings.join("；") : `已打开 · ${next.project.title}`);
  }

  async function openFolder() {
    if (!discardConfirmed()) return;
    const picker = (window as LocalWindow).showDirectoryPicker;
    if (!picker) { folderInput.current?.click(); return; }
    try {
      const handle = await picker.call(window, { mode: "readwrite" });
      setBusy(true); setError("");
      const files = await readDirectory(handle);
      activate(await loadWorkspace(files, handle.name), handle, !files.has("workspace.json"));
    } catch (e) { handleError(e); } finally { setBusy(false); }
  }
  async function openFolderFiles(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true); setError("");
    try {
      const files = new Map<string, Blob>();
      for (const file of Array.from(list)) files.set(file.webkitRelativePath.split("/").slice(1).join("/"), file);
      activate(await loadWorkspace(files, list[0].webkitRelativePath.split("/")[0]), null, !files.has("workspace.json"));
    } catch (e) { handleError(e); } finally { setBusy(false); }
  }
  async function openArchive(file?: File) {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
      const files = new Map<string, Blob>();
      for (const [path, bytes] of Object.entries(entries)) if (!path.endsWith("/")) files.set(safePath(path), new Blob([bytes as BlobPart]));
      activate(await loadWorkspace(files, file.name.replace(/\.zip$/i, "")));
    } catch (e) { handleError(e); } finally { setBusy(false); }
  }
  function newProject() {
    if (!discardConfirmed()) return;
    activate(emptyWorkspace(), null, true);
    setNotice("空白工程已创建，可新建 Markdown 或导入资料。");
  }
  async function save(asNew = false) {
    const picker = (window as LocalWindow).showDirectoryPicker;
    if (!picker) { await exportArchive(); return; }
    try {
      let handle = asNew ? null : directory.current;
      if (!handle) {
        handle = await picker.call(window, { mode: "readwrite" });
        const existing = await readDirectory(handle);
        if (existing.size && !window.confirm("此文件夹已有文件。保存会覆盖工程中的同名文件，其他文件会保留。继续保存？")) return;
      }
      if (handle.requestPermission && await handle.requestPermission({ mode: "readwrite" }) !== "granted") throw new Error("未获得文件夹写入权限。请重新选择文件夹或导出工程 ZIP。");
      setBusy(true); setError("");
      const atRevision = revision.current;
      await saveDirectory(handle, currentWorkspace.current);
      directory.current = handle; setDirectoryName(handle.name);
      if (revision.current === atRevision) setDirty(false);
      setNotice(`已保存到文件夹 · ${handle.name}`);
    } catch (e) { handleError(e); } finally { setBusy(false); }
  }
  async function exportArchive() {
    setBusy(true); setError("");
    try {
      const atRevision = revision.current;
      const files = await serializeWorkspace(currentWorkspace.current);
      const entries: Record<string, Uint8Array> = {};
      for (const [path, blob] of files) entries[path] = new Uint8Array(await blob.arrayBuffer());
      const bytes = await new Promise<Uint8Array>((resolve, reject) => zip(entries, { level: 1 }, (e, data) => e ? reject(e) : resolve(data)));
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
      const a = document.createElement("a"); a.href = url; a.download = `${project.title.replace(/[\\/:*?"<>|]/g, "-") || "枝间工程"}.zip`; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      if (!directory.current && revision.current === atRevision) setDirty(false);
      setNotice(directory.current ? "已导出工程副本；当前文件夹尚需点击保存。" : "工程 ZIP 已导出，解压后可直接打开文件夹。");
    } catch (e) { handleError(e); } finally { setBusy(false); }
  }
  function addMarkdown(parentId: string | null = null) {
    const id = uid(), parent = nodes.find(n => n.id === parentId);
    const node: ProjectNode = { id, title: "未命名笔记", kind: "markdown", path: `content/${id}.md`, parentId, color: null, position: parent ? { x: parent.position.x + 320, y: parent.position.y + 180 } : { x: 60 + (nodes.length % 3) * 310, y: 70 + Math.floor(nodes.length / 3) * 200 }, page: 1, note: "" };
    change(w => ({ ...w, project: { ...w.project, nodes: [...w.project.nodes, node] }, documents: { ...w.documents, [id]: "" } }));
    selectNode(id); setEditorMode("edit");
  }
  async function importFiles(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true); setError("");
    try {
      const key = (path: string) => path.normalize("NFC").toLocaleLowerCase("en-US");
      const files = new Map<string, Blob>(), used = new Set([...nodes.map(n => n.path), ...Object.keys(workspace.assets)].map(key));
      const skipped: string[] = [];
      for (const file of Array.from(list)) {
        const path = safePath(file.name);
        if (used.has(key(path))) { skipped.push(path); continue; }
        used.add(key(path)); files.set(path, file);
      }
      const incoming = await loadWorkspace(files, project.title);
      const idMap = new Map(incoming.project.nodes.map(n => [n.id, uid()]));
      const incomingNodes = incoming.project.nodes.map((n, i) => ({ ...n, id: idMap.get(n.id)!, parentId: n.parentId ? idMap.get(n.parentId)! : null, position: { x: 60 + ((nodes.length + i) % 3) * 310, y: 70 + Math.floor((nodes.length + i) / 3) * 200 } }));
      const docs = Object.fromEntries(Object.entries(incoming.documents).map(([id, text]) => [idMap.get(id)!, text]));
      const links = incoming.project.links.map(l => ({ ...l, id: uid(), source: idMap.get(l.source)!, target: idMap.get(l.target)! }));
      const imageAssets = Object.fromEntries([...files].filter(([path]) => /\.(png|jpe?g|webp|gif)$/i.test(path)));
      const next = { ...currentWorkspace.current, project: { ...currentWorkspace.current.project, nodes: [...currentWorkspace.current.project.nodes, ...incomingNodes], links: [...currentWorkspace.current.project.links, ...links] }, documents: { ...currentWorkspace.current.documents, ...docs }, assets: { ...currentWorkspace.current.assets, ...incoming.assets, ...imageAssets } };
      // Validate the complete merged project before applying an import.
      await serializeWorkspace(next);
      if (incomingNodes.length || Object.keys(imageAssets).length) change(() => next);
      if (incomingNodes[0]) selectNode(incomingNodes[0].id);
      setNotice(`已导入 ${incomingNodes.length} 个文档、${Object.keys(imageAssets).length} 张图片${skipped.length ? `；跳过同名文件：${skipped.join("、")}` : ""}${incoming.warnings.length ? `；${incoming.warnings.join("；")}` : ""}`);
    } catch (e) { handleError(e); } finally { setBusy(false); }
  }
  function addLink() {
    if (!active || !linkTarget || active.id === linkTarget) return;
    const target = nodes.find(n => n.id === linkTarget);
    const targetPage = target?.kind === "pdf" ? Math.max(1, Math.floor(linkPage || 1)) : undefined;
    if (project.links.some(l => l.source === active.id && l.target === linkTarget && l.targetPage === targetPage)) { setNotice("这条关联已经存在。"); return; }
    updateProject({ links: [...project.links, { id: uid(), source: active.id, target: linkTarget, label: linkLabel.trim() || "引用", ...(targetPage ? { targetPage } : {}) }] });
    setLinkTarget(""); setLinkLabel(""); setNotice("关联已加入脑图。");
  }
  function removeNode() {
    if (!active || !window.confirm(`从工程中移除“${active.title}”？磁盘上的原文件仍会保留。`)) return;
    change(w => ({ ...w, assets: active.kind === "markdown" && Object.hasOwn(w.documents, active.id) ? { ...w.assets, [active.path]: new Blob([w.documents[active.id]], { type: "text/markdown;charset=utf-8" }) } : w.assets, project: { ...w.project, nodes: w.project.nodes.filter(n => n.id !== active.id).map(n => n.parentId === active.id ? { ...n, parentId: null } : n), links: w.project.links.filter(l => l.source !== active.id && l.target !== active.id) } })); setActiveId(null);
  }
  function validParent(candidate: ProjectNode) {
    if (!active || active.id === candidate.id) return false;
    const seen = new Set<string>(); let next: ProjectNode | undefined = candidate;
    while (next && !seen.has(next.id)) { if (next.id === active.id) return false; seen.add(next.id); next = nodes.find(n => n.id === next?.parentId); }
    return true;
  }
  function navigateFile(path: string, page?: number) { const node = nodes.find(n => n.path === path); if (node) selectNode(node.id, page); else setError(`工程中未找到 ${path}，请导入该文件。`); }
  function autoLayout() {
    const positions = new Map<string, { x: number; y: number }>(); let row = 0;
    const visit = (node: ProjectNode, depth: number) => { positions.set(node.id, { x: 56 + depth * 330, y: 56 + row++ * 160 }); nodes.filter(n => n.parentId === node.id).forEach(n => visit(n, depth + 1)); };
    nodes.filter(n => !n.parentId).forEach(n => visit(n, 0));
    updateProject({ nodes: nodes.map(n => ({ ...n, position: positions.get(n.id) || n.position })) }); canvasRef.current?.scrollTo(0, 0);
  }
  function connection(source: ProjectNode, target: ProjectNode, key: string, dashed: boolean, label = "", page?: number) {
    const sx = source.position.x * zoom + 240, sy = source.position.y * zoom + 52, tx = target.position.x * zoom, ty = target.position.y * zoom + 52, offset = Math.max(65, Math.abs(tx - sx) * .5);
    return <g key={key} className={dashed ? "reference-line" : "parent-line"} style={{ color: colorOf(target, nodes) }}><path d={`M${sx},${sy} C${sx + offset},${sy} ${tx - offset},${ty} ${tx},${ty}`} stroke="currentColor" fill="none" strokeWidth="2" strokeDasharray={dashed ? "6 5" : undefined} />{label && <text x={(sx + tx) / 2} y={(sy + ty) / 2 - 8} textAnchor="middle">{label}{page ? ` · p.${page}` : ""}</text>}</g>;
  }

  return <main className="app-shell" data-pane={mobilePane}>
    <header className="app-header"><div className="brand"><span className="brand-symbol"><Icon name="map" /></span><strong>枝间</strong><span className="brand-caption">文件思维地图</span></div><input className="project-title" aria-label="工程名称" value={project.title} disabled={busy} onChange={e => updateProject({ title: e.target.value })} onBlur={() => { if (!project.title.trim()) updateProject({ title: "未命名工程" }); }} /><div className="header-actions"><span className={`save-status ${dirty ? "unsaved" : ""}`}>{busy ? "处理中…" : dirty ? "未保存" : directoryName ? "已保存" : "本地工程"}</span><button disabled={busy} onClick={openFolder}><Icon name="folder" />打开文件夹</button><button className="primary" disabled={busy} onClick={() => save()}><Icon name="save" />保存</button></div></header>
    <nav className="workspace-bar" aria-label="工程操作"><div className="view-tabs"><button className={project.view.mode === "map" ? "selected" : ""} onClick={() => { updateProject({ view: { ...project.view, mode: "map" } }); setMobilePane("map"); }}><Icon name="map" />Map</button><button className={project.view.mode === "linear" ? "selected" : ""} onClick={() => { updateProject({ view: { ...project.view, mode: "linear" } }); setMobilePane("map"); }}><Icon name="file" />线性</button></div><span className="workspace-location">{directoryName || "尚未连接文件夹"}</span><div className="utility-actions"><button disabled={busy} onClick={newProject}>新工程</button><button disabled={busy} onClick={() => { if (discardConfirmed()) archiveInput.current?.click(); }}>打开 ZIP</button><button disabled={busy} onClick={() => save(true)}>另存为</button><button disabled={busy} onClick={exportArchive}><Icon name="download" />导出工程</button></div></nav>
    {(error || notice) && <div className={`message-bar ${error ? "error" : ""}`} role={error ? "alert" : "status"}><span>{error || notice}</span><button aria-label="关闭提示" onClick={() => { setError(""); setNotice(""); }}><Icon name="close" /></button></div>}
    <nav className="mobile-tabs" aria-label="工作区面板"><button aria-pressed={mobilePane === "files"} onClick={() => setMobilePane("files")}>文件</button><button aria-pressed={mobilePane === "map"} onClick={() => setMobilePane("map")}>结构</button><button aria-pressed={mobilePane === "reader"} onClick={() => setMobilePane("reader")}>阅读 / 编辑</button></nav>
    <div className="workspace-grid">
      <aside className="file-sidebar"><div className="panel-heading"><h2>工程文件</h2><span>{nodes.length}</span></div><div className="file-actions"><button disabled={busy} onClick={() => addMarkdown()}><Icon name="plus" />新建笔记</button><button disabled={busy} onClick={() => importInput.current?.click()}>导入</button></div><label className="file-search"><Icon name="search" /><input aria-label="搜索文件" placeholder="搜索文件…" value={search} onChange={e => setSearch(e.target.value)} /></label><div className="file-list">{(["markdown", "pdf"] as const).map(kind => <section key={kind}><h3>{kind === "markdown" ? "MARKDOWN" : "PDF 资料"}<span>{nodes.filter(n => n.kind === kind).length}</span></h3>{filtered.filter(n => n.kind === kind).map(n => <button className={`file-row ${activeId === n.id ? "active" : ""}`} key={n.id} onClick={() => selectNode(n.id)}><span className={`file-type ${kind}`}>{kind === "markdown" ? "M↓" : "PDF"}</span><span className="file-label"><strong>{n.title}</strong><small>{fileName(n.path)}</small></span></button>)}{!filtered.some(n => n.kind === kind) && <p className="quiet-hint">{search ? "无匹配文件" : kind === "markdown" ? "新建或导入 .md 文件" : "导入 .pdf 作为参考资料"}</p>}</section>)}</div><div className="sidebar-footer"><strong>文件在本地，关系在工程里</strong><p>JSON 记录脑图，Markdown 和 PDF 保持独立文件。</p></div></aside>
      <section className="map-panel" aria-label="文档结构"><div className="panel-heading"><h2>{project.view.mode === "map" ? "文件关系图" : "线性阅读"}</h2><span>{nodes.length} 个文件 · {project.links.length} 条关联</span></div>
        {nodes.length === 0 ? <div className="workspace-empty"><Icon name="map" /><h2>从一份文档开始</h2><p>把写作笔记与 PDF 资料连接起来。</p><dl><div><dt>Markdown 笔记</dt><dd>编辑正文，预览标题、链接和图片。</dd></div><div><dt>PDF 参考资料</dt><dd>阅读原文，将引用连接到具体页码。</dd></div><div><dt>Mindmap 工程</dt><dd>保存文件关系、层级和节点位置。</dd></div></dl><div className="empty-actions"><button disabled={busy} className="primary" onClick={() => importInput.current?.click()}><Icon name="plus" />导入 Markdown / PDF</button><button disabled={busy} onClick={() => addMarkdown()}>新建空白笔记</button></div></div> : project.view.mode === "map" ? <>
          <div className="map-scroll" ref={canvasRef}><div className="map-board" style={{ width: mapWidth, height: mapHeight }}><svg className="map-lines" width={mapWidth} height={mapHeight} aria-hidden="true">{nodes.map(n => { const parent = nodes.find(p => p.id === n.parentId); return parent ? connection(parent, n, `parent-${n.id}`, false) : null; })}{project.links.map(link => { const source = nodes.find(n => n.id === link.source), target = nodes.find(n => n.id === link.target); return source && target ? connection(source, target, link.id, true, link.label, link.targetPage) : null; })}</svg>{nodes.map(n => <div className={`map-node ${activeId === n.id ? "active" : ""}`} key={n.id} style={{ left: n.position.x * zoom, top: n.position.y * zoom, borderTopColor: colorOf(n, nodes) }}><button className="node-drag" aria-label={`移动 ${n.title}`} disabled={busy} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { id: n.id, clientX: e.clientX, clientY: e.clientY, ...n.position }; }} onPointerMove={e => { const d = drag.current; if (!d || d.id !== n.id) return; updateNode(n.id, { position: { x: Math.max(12, d.x + (e.clientX - d.clientX) / zoom), y: Math.max(12, d.y + (e.clientY - d.clientY) / zoom) } }); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onKeyDown={e => { const vectors: Record<string, [number, number]> = { ArrowUp: [0, -20], ArrowDown: [0, 20], ArrowLeft: [-20, 0], ArrowRight: [20, 0] }; if (vectors[e.key]) { e.preventDefault(); const [dx, dy] = vectors[e.key]; updateNode(n.id, { position: { x: Math.max(12, n.position.x + dx), y: Math.max(12, n.position.y + dy) } }); } }}>⠿</button><button className="node-content" onClick={() => selectNode(n.id)}><span className={`file-type ${n.kind}`}>{n.kind === "markdown" ? "M↓" : "PDF"}</span><strong>{n.title}</strong><span>{n.kind === "pdf" ? `第 ${n.page} 页` : `${(workspace.documents[n.id] || "").length} 字符`}<i> · </i>{project.links.filter(l => l.source === n.id || l.target === n.id).length} 条关联</span></button></div>)}</div></div><div className="map-footer"><span><i className="legend-line" />层级 <i className="legend-line dashed" />引用</span><div><button disabled={zoom <= .6} aria-label="缩小图间距" onClick={() => updateProject({ view: { ...project.view, zoom: Math.max(.6, zoom - .2) } })}>−</button><output>{Math.round(zoom * 100)}%</output><button disabled={zoom >= 1.8} aria-label="放大图间距" onClick={() => updateProject({ view: { ...project.view, zoom: Math.min(1.8, zoom + .2) } })}>＋</button><button onClick={autoLayout}>整理布局</button></div></div>
        </> : <div className="linear-content">{!nodes.some(n => n.kind === "markdown") && <p>尚无 Markdown 正文。在左侧新建笔记开始写作。</p>}{nodes.filter(n => n.kind === "markdown").map(n => <article key={n.id} className="linear-article"><button className="article-title" onClick={() => selectNode(n.id)}><h2>{n.title}</h2><span>编辑 ↗</span></button><MarkdownPreview text={workspace.documents[n.id] || ""} path={n.path} assets={workspace.assets} onNavigate={navigateFile} /><div className="article-references">{project.links.filter(l => l.source === n.id).map(l => <button key={l.id} onClick={() => selectNode(l.target, l.targetPage)}><Icon name="link" />{nodes.find(t => t.id === l.target)?.title}{l.targetPage ? ` · p.${l.targetPage}` : ""}</button>)}</div></article>)}</div>}
      </section>
      <aside className="document-panel" aria-label="文档阅读编辑区"><div className="panel-heading"><h2>{active ? active.kind === "pdf" ? "PDF 阅读" : "Markdown 编辑" : "阅读与编辑"}</h2>{active && <button aria-label="关闭当前文档" onClick={() => setActiveId(null)}><Icon name="close" /></button>}</div>{!active ? <div className="reader-empty"><Icon name="file" /><h2>选择一个文件</h2><p>点击脑图节点或文件列表，在这里阅读和编辑。</p></div> : <>
          <div className="document-heading"><input aria-label="节点标题" value={active.title} disabled={busy} onChange={e => updateNode(active.id, { title: e.target.value })} /><span title={active.path}>{active.path}</span></div><div className="reader-tabs"><button aria-pressed={inspectorTab === "content"} onClick={() => setInspectorTab("content")}>内容</button><button aria-pressed={inspectorTab === "relations"} onClick={() => setInspectorTab("relations")}><Icon name="link" />关联 · {activeLinks.length}</button>{inspectorTab === "content" && active.kind === "markdown" && <div><button aria-pressed={editorMode === "edit"} onClick={() => setEditorMode("edit")}>源码</button><button aria-pressed={editorMode === "preview"} onClick={() => setEditorMode("preview")}>预览</button></div>}</div>
          {inspectorTab === "content" ? <div className="document-content">{active.kind === "pdf" ? <PDFReader file={workspace.assets[active.path]} page={active.page} onPageChange={page => updateNode(active.id, { page })} /> : editorMode === "edit" ? <textarea className="markdown-editor" aria-label="Markdown 正文" value={workspace.documents[active.id] || ""} disabled={busy || !Object.hasOwn(workspace.documents, active.id)} placeholder={"# 标题\n\n在这里写作，也可以用 Markdown 链接引用其他文件。"} spellCheck={false} onChange={e => change(w => ({ ...w, documents: { ...w.documents, [active.id]: e.target.value } }))} /> : <div className="markdown-preview-wrap"><MarkdownPreview text={workspace.documents[active.id] || ""} path={active.path} assets={workspace.assets} onNavigate={navigateFile} /></div>}</div> : <div className="relations-panel">
            <section><h3>层级与颜色</h3><label>父节点<select aria-label="父节点" value={active.parentId || ""} onChange={e => updateNode(active.id, { parentId: e.target.value || null })}><option value="">无 · 根节点</option>{nodes.filter(validParent).map(n => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label><div className="color-row"><span>分支颜色</span><button className={!active.color ? "selected" : ""} onClick={() => updateNode(active.id, { color: null })}>继承</button>{palette.map(c => <button key={c} aria-label={`分支颜色 ${c}`} aria-pressed={active.color === c} className="color-swatch" style={{ backgroundColor: c }} onClick={() => updateNode(active.id, { color: c })} />)}</div><p className="field-hint">子节点继承颜色，设置后可独立覆盖。</p><button className="full-button" onClick={() => addMarkdown(active.id)}><Icon name="plus" />添加子笔记</button></section>
            <section><h3>连接资料</h3><label>目标文件<select aria-label="关联目标" value={linkTarget} onChange={e => { setLinkTarget(e.target.value); setLinkPage(nodes.find(n => n.id === e.target.value)?.page || 1); }}><option value="">选择 Markdown 或 PDF</option>{nodes.filter(n => n.id !== active.id).map(n => <option key={n.id} value={n.id}>{n.kind === "pdf" ? "PDF" : "MD"} · {n.title}</option>)}</select></label>{nodes.find(n => n.id === linkTarget)?.kind === "pdf" && <label>引用页码<input aria-label="引用页码" type="number" min="1" value={linkPage} onChange={e => setLinkPage(Number(e.target.value))} /></label>}<label>关系名称<input aria-label="关系名称" placeholder="例如：参考、依据、待核对" value={linkLabel} onChange={e => setLinkLabel(e.target.value)} /></label><button className="primary full-button" disabled={!linkTarget || busy} onClick={addLink}><Icon name="link" />建立关联</button></section>
            <section><h3>已连接 · {activeLinks.length}</h3>{activeLinks.length === 0 && <p className="field-hint">还没有关联。</p>}{activeLinks.map(l => { const outgoing = l.source === active.id, target = nodes.find(n => n.id === (outgoing ? l.target : l.source)); return <div className="relation-row" key={l.id}><button onClick={() => selectNode(target!.id, outgoing ? l.targetPage : undefined)}><strong>{target?.title}</strong><span>{outgoing ? "引用 →" : "← 被引用"} {l.label}{l.targetPage ? ` · p.${l.targetPage}` : ""}</span></button><button aria-label={`删除关联 ${l.label}`} onClick={() => updateProject({ links: project.links.filter(x => x.id !== l.id) })}><Icon name="close" /></button></div>; })}</section><section><label>文档旁注<textarea aria-label="文档旁注" value={active.note} onChange={e => updateNode(active.id, { note: e.target.value })} placeholder="记录这份资料的用途或阅读线索…" /></label></section><button className="danger-text" onClick={removeNode}>从工程移除此节点</button>
          </div>}<div className="reader-footer"><span>{active.kind === "markdown" ? `${(workspace.documents[active.id] || "").length} 字符` : `PDF · 第 ${active.page} 页`}</span><button onClick={() => setInspectorTab(inspectorTab === "relations" ? "content" : "relations")}>{inspectorTab === "relations" ? "返回文档" : "连接资料"}<Icon name="arrow" /></button></div>
        </>}
      </aside>
    </div>
    <input ref={importInput} type="file" accept=".md,.markdown,.pdf,.png,.jpg,.jpeg,.webp,.gif" multiple hidden aria-label="导入文件" onChange={e => { void importFiles(e.target.files); e.target.value = ""; }} />
    <input ref={folderInput} type="file" multiple hidden aria-label="导入工作区文件夹" {...{ webkitdirectory: "" }} onChange={e => { void openFolderFiles(e.target.files); e.target.value = ""; }} />
    <input ref={archiveInput} type="file" accept=".zip" hidden aria-label="打开工程 ZIP" onChange={e => { void openArchive(e.target.files?.[0]); e.target.value = ""; }} />
  </main>;
}
