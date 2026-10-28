import test from "node:test";
import assert from "node:assert/strict";
// Node's native TypeScript runner requires the source extension.
// @ts-ignore -- the application uses bundler resolution; this test runs directly in Node 24.
import { emptyWorkspace, loadWorkspace, readDirectory, safePath, saveDirectory, serializeWorkspace, validateProject } from "../lib/workspace.ts";
import type { Project, WorkspaceDirectoryHandle, WorkspaceFileHandle } from "../lib/workspace";

const textBlob = (text: string) => new Blob([text]);
const manifestBlob = (project: Project) => textBlob(JSON.stringify(project));
const pdfBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 10, 0, 128, 255, 10, 37, 37, 69, 79, 70]);
const pdf = () => new Blob([pdfBytes], { type: "application/pdf" });
const projectWithNotes = (): Project => ({
  ...emptyWorkspace().project,
  title: "链接工作区",
  nodes: [
    { id: "note", title: "笔记", kind: "markdown", path: "notes/start.md", parentId: null, color: "#aabbcc", position: { x: 12.5, y: -20 }, page: 1, note: "一条旁注" },
    { id: "paper", title: "资料", kind: "pdf", path: "references/paper.pdf", parentId: "note", color: null, position: { x: 400, y: 20 }, page: 3, note: "PDF 摘录" },
  ],
  links: [{ id: "reference", source: "note", target: "paper", targetPage: 3, label: "引用" }],
  view: { mode: "linear", zoom: 0.8 },
  sideNote: "工作区旁注",
});

test("v2 roundtrip preserves exact UTF-8 Markdown, PDF bytes, metadata and linked images", async () => {
  const markdown = "\ufeff# 标题\r\n\r\n原始 **Markdown** 与 emoji 🐻\r\n![image](../assets/photo.png)\r\n[PDF](../references/paper.pdf#page=3)\r\n\r\n";
  const files = new Map([
    ["workspace.json", manifestBlob(projectWithNotes())],
    ["notes/start.md", textBlob(markdown)],
    ["references/paper.pdf", pdf()],
    ["assets/photo.png", new Blob([new Uint8Array([1, 2, 128, 255])])],
    ["unrelated.txt", textBlob("Do not copy unrelated files")],
  ]);
  const workspace = await loadWorkspace(files);
  assert.equal(workspace.documents.note, markdown);
  assert.equal(workspace.warnings.length, 0);
  const output = await serializeWorkspace(workspace);
  assert.equal(output.has("unrelated.txt"), false);
  assert.equal(new TextDecoder("utf-8", { ignoreBOM: true }).decode(await output.get("notes/start.md")!.arrayBuffer()), markdown);
  assert.deepEqual(new Uint8Array(await output.get("references/paper.pdf")!.arrayBuffer()), pdfBytes);
  const reopened = await loadWorkspace(output);
  assert.deepEqual(reopened.project, workspace.project);
  assert.equal(reopened.documents.note, markdown);
  assert.deepEqual(Object.keys(reopened.assets).sort(), ["assets/photo.png", "references/paper.pdf"]);
});

test("folder discovery scans nested Markdown/PDF, derives titles and references with PDF page numbers", async () => {
  const workspace = await loadWorkspace(new Map([
    ["notes/chapter.markdown", textBlob("# 一个章节\n\n[研究](../library/paper.pdf#page=4)\n[另一篇](other.md)\n![示意图](../assets/figure%20one.svg)")],
    ["notes/other.md", textBlob("# 另一篇\n")],
    ["library/paper.pdf", pdf()],
    ["assets/figure one.svg", textBlob("<svg/>")],
  ]), "我的工程");
  assert.equal(workspace.project.title, "我的工程");
  assert.equal(workspace.project.nodes.length, 3);
  assert.equal(workspace.project.nodes.find((node) => node.path === "notes/chapter.markdown")?.title, "一个章节");
  assert.equal(workspace.project.links.length, 2);
  assert.equal(workspace.project.links.find((link) => link.targetPage)?.targetPage, 4);
  assert.ok(workspace.assets["assets/figure one.svg"]);
  assert.equal(workspace.warnings.length, 0);
});

test("legacy migration retains raw Markdown, citations, quotes, images and side note after reopening", async () => {
  const legacy = {
    version: 1, title: "旧工程", sideNote: "原始旁注", view: { mode: "linear", branchColor: "#d96c52" },
    blocks: [{ id: "opening", index: "01", title: "开头", bodyFile: "content/01-opening.md", quote: "原始引文", imagePath: "assets/cover image.png", ref: { label: "引用标题", url: "https://example.test/source", note: "引用备注" } }],
  };
  const raw = "# 开头\r\n正文\r\n";
  const workspace = await loadWorkspace(new Map([
    ["workspace.json", textBlob(JSON.stringify(legacy))],
    ["content/01-opening.md", textBlob(raw)],
    ["assets/cover image.png", textBlob("image bytes")],
  ]));
  assert.equal(workspace.project.version, 2);
  assert.equal(workspace.project.sideNote, legacy.sideNote);
  assert.equal(workspace.documents.opening, raw);
  assert.match(workspace.project.nodes[0].note, /原始引文/);
  assert.match(workspace.project.nodes[0].note, /https:\/\/example.test\/source/);
  assert.match(workspace.project.nodes[0].note, /引用备注/);
  const reopened = await loadWorkspace(await serializeWorkspace(workspace));
  assert.equal(reopened.documents.opening, raw);
  assert.ok(reopened.assets["assets/cover image.png"]);
  assert.deepEqual(reopened.project, workspace.project);
});

test("legacy inline body fallback survives when the old body file was never created", async () => {
  const workspace = await loadWorkspace(new Map([["workspace.json", textBlob(JSON.stringify({ version: 1, blocks: [{ id: "inline", title: "内联", body: "原始内联正文\n" }] }))]]));
  assert.equal(workspace.documents.inline, "原始内联正文\n");
  assert.equal((await serializeWorkspace(workspace)).has("content/01-inline.md"), true);
});

test("missing Markdown/PDF warns on open and prevents any save rather than replacing content with blank", async () => {
  const workspace = await loadWorkspace(new Map([["workspace.json", manifestBlob(projectWithNotes())]]));
  assert.equal(workspace.warnings.length, 2);
  assert.equal(Object.hasOwn(workspace.documents, "note"), false);
  await assert.rejects(serializeWorkspace(workspace), /缺少正文/);
  workspace.documents.note = "restored";
  await assert.rejects(serializeWorkspace(workspace), /缺少 PDF/);
});

test("malformed JSON, invalid UTF-8 and missing linked assets do not silently become empty documents", async () => {
  await assert.rejects(loadWorkspace(new Map([["workspace.json", textBlob("{")]])), /有效的 JSON/);
  const badText = await loadWorkspace(new Map([["bad.md", new Blob([new Uint8Array([0xff, 0xfe, 0x80])])]]));
  assert.equal(Object.keys(badText.documents).length, 0);
  assert.match(badText.warnings[0], /无法读取/);
  await assert.rejects(serializeWorkspace(badText), /缺少正文/);
  const missing = await loadWorkspace(new Map([["note.md", textBlob("![missing](assets/missing.png)\n[online](https://example.test)\n[bad](../outside.md)")]]));
  assert.equal(missing.warnings.length, 2);
});

test("safe paths reject traversal, absolute paths, reserved filenames and file-directory collisions", async () => {
  for (const path of ["", "/tmp/a.md", "../a.md", "a/../b.md", "a//b.md", "a/./b.md", "C:/a.md", "a\\b.md", "a\0.md", "a. ", "CON.md", "a/NUL.pdf"]) assert.throws(() => safePath(path), /不安全/);
  assert.equal(safePath("笔记/文章 1.md"), "笔记/文章 1.md");
  await assert.rejects(loadWorkspace(new Map([["Note.md", textBlob("")], ["note.md", textBlob("")]])), /冲突/);
  await assert.rejects(loadWorkspace(new Map([["a.md", textBlob("")], ["a.md/b.md", textBlob("")]])), /冲突/);
  await assert.rejects(loadWorkspace(new Map([["Workspace.json", textBlob("{}")]])), /名称必须/);
  const workspace = emptyWorkspace();
  workspace.assets["workspace.json"] = textBlob("overwrite");
  await assert.rejects(serializeWorkspace(workspace), /不能覆盖/);
});

test("manifest rejects duplicate IDs, dangling links, parent cycles and invalid data types", () => {
  const invalid: { edit(project: Project): void; message: RegExp }[] = [
    { edit: (p) => { p.nodes[1].id = "note"; }, message: /ID 重复/ },
    { edit: (p) => { p.nodes[0].parentId = "paper"; }, message: /循环/ },
    { edit: (p) => { p.nodes[0].parentId = "absent"; }, message: /父节点不存在/ },
    { edit: (p) => { p.links[0].target = "absent"; }, message: /不存在的节点/ },
    { edit: (p) => { p.nodes[0].position.x = Infinity; }, message: /坐标无效/ },
    { edit: (p) => { p.nodes[1].page = 0; }, message: /正整数/ },
    { edit: (p) => { p.nodes[0].path = "workspace.json"; }, message: /扩展名/ },
    { edit: (p) => { p.nodes[0].color = "red"; }, message: /颜色无效/ },
    { edit: (p) => { p.view.zoom = NaN; }, message: /视图设置/ },
    { edit: (p) => { p.links[0].target = "note"; }, message: /只有 PDF/ },
  ];
  for (const item of invalid) { const project = projectWithNotes(); item.edit(project); assert.throws(() => validateProject(project), item.message); }
  const wrongType = { ...projectWithNotes(), title: 5 };
  assert.throws(() => validateProject(wrongType), /必须是文本/);
});

test("reference-style links, escaped filenames and transitive image resources survive export", async () => {
  const project = projectWithNotes();
  const workspace = await loadWorkspace(new Map([
    ["workspace.json", manifestBlob(project)],
    ["notes/start.md", textBlob("[extra][more]\n\n[more]: ../extra/linked.md\n![photo](../assets/figure\\(1\\).png)")],
    ["extra/linked.md", textBlob("![second](../assets/nested.png)")],
    ["assets/figure(1).png", textBlob("first")],
    ["assets/nested.png", textBlob("second")],
    ["references/paper.pdf", pdf()],
  ]));
  const files = await serializeWorkspace(workspace);
  assert.equal(files.has("extra/linked.md"), true);
  assert.equal(files.has("assets/figure(1).png"), true);
  assert.equal(files.has("assets/nested.png"), true);
  assert.equal(workspace.warnings.length, 0);
});

test("workspace-root image URLs and query-string PDF pages match preview resolution and survive reopening", async () => {
  const workspace = await loadWorkspace(new Map([
    ["notes/readme.md", textBlob("![figure](/assets/figure.png)\n[PDF](/papers/reference.pdf?page=12)")],
    ["assets/figure.png", textBlob("image bytes")],
    ["papers/reference.pdf", pdf()],
  ]));
  assert.equal(workspace.project.links[0].targetPage, 12);
  assert.equal(workspace.warnings.length, 0);
  const reopened = await loadWorkspace(await serializeWorkspace(workspace));
  assert.equal(await reopened.assets["assets/figure.png"].text(), "image bytes");
  assert.equal(reopened.project.links[0].targetPage, 12);
  assert.throws(() => safePath("/assets/figure.png"), /不安全/);
});

test("resource inventory preserves intentionally imported loose images and retained Markdown across reloads", async () => {
  const workspace = await loadWorkspace(new Map([
    ["note.md", textBlob("# Existing note\n")],
    ["unrelated-private.txt", textBlob("not an imported resource")],
  ]));
  workspace.assets["assets/imported.png"] = textBlob("loose image bytes");
  workspace.assets["retained.md"] = textBlob("# Removed map node\n![retained](assets/imported.png)\n");
  const output = await serializeWorkspace(workspace);
  const manifest = JSON.parse(await output.get("workspace.json")!.text()) as Project;
  assert.deepEqual(manifest.resources, ["assets/imported.png", "retained.md"]);
  assert.equal(output.has("unrelated-private.txt"), false);
  const reopened = await loadWorkspace(output);
  assert.equal(reopened.project.nodes.length, 1);
  assert.equal(await reopened.assets["assets/imported.png"].text(), "loose image bytes");
  assert.equal(await reopened.assets["retained.md"].text(), "# Removed map node\n![retained](assets/imported.png)\n");
  const secondReopen = await loadWorkspace(await serializeWorkspace(reopened));
  assert.deepEqual(secondReopen.project, reopened.project);
  assert.equal(await secondReopen.assets["assets/imported.png"].text(), "loose image bytes");
});

test("missing inventoried resources warn on open and block saving before any writes", async () => {
  const project = { ...emptyWorkspace().project, resources: ["assets/missing.png"] };
  const workspace = await loadWorkspace(new Map([["workspace.json", manifestBlob(project)]]));
  assert.equal(workspace.warnings.length, 1);
  assert.match(workspace.warnings[0], /缺少资源/);
  await assert.rejects(serializeWorkspace(workspace), /缺少资源/);
  const directory = new MemoryDirectory();
  await assert.rejects(saveDirectory(directory, workspace), /缺少资源/);
  assert.equal(directory.entries.size, 0);
});

test("resource inventory defaults for older v2 manifests and rejects unsafe or colliding paths", () => {
  const oldProject = projectWithNotes();
  delete oldProject.resources;
  assert.deepEqual(validateProject(oldProject).resources, []);
  for (const resources of [
    ["workspace.json"], ["notes/start.md"], ["NOTES/START.md"], ["notes"], ["notes/start.md/image.png"],
    ["assets/image.png", "assets/IMAGE.png"], ["../image.png"], ["/absolute.png"], ["image\\bad.png"],
  ]) assert.throws(() => validateProject({ ...projectWithNotes(), resources }));
  assert.throws(() => validateProject({ ...projectWithNotes(), resources: "image.png" }), /resources/);
  assert.throws(() => validateProject({ ...projectWithNotes(), resources: [12] }), /必须是文本/);
});

test("PDF node files are required through nodes and excluded from the loose-resource inventory", async () => {
  const workspace = await loadWorkspace(new Map([["paper.pdf", pdf()]]));
  workspace.assets["loose.png"] = textBlob("image");
  const output = await serializeWorkspace(workspace);
  const manifest = JSON.parse(await output.get("workspace.json")!.text()) as Project;
  assert.deepEqual(manifest.resources, ["loose.png"]);
  const reopened = await loadWorkspace(output);
  assert.ok(reopened.assets["paper.pdf"]);
  assert.ok(reopened.assets["loose.png"]);
});

class MemoryDirectory implements WorkspaceDirectoryHandle {
  kind = "directory" as const;
  name: string;
  entries = new Map<string, MemoryDirectory | MemoryFile>();
  writes: string[];
  prefix: string;
  failAt: string;
  constructor(name = "root", writes: string[] = [], prefix = "", failAt = "") { this.name = name; this.writes = writes; this.prefix = prefix; this.failAt = failAt; }
  async *values() { yield* this.entries.values(); }
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    let entry = this.entries.get(name);
    if (!entry && options?.create) { entry = new MemoryDirectory(name, this.writes, `${this.prefix}${name}/`, this.failAt); this.entries.set(name, entry); }
    if (!(entry instanceof MemoryDirectory)) throw new Error("NotFoundError");
    return entry;
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    let entry = this.entries.get(name);
    if (!entry && options?.create) { entry = new MemoryFile(name, textBlob(""), this.writes, `${this.prefix}${name}`, this.failAt); this.entries.set(name, entry); }
    if (!(entry instanceof MemoryFile)) throw new Error("NotFoundError");
    return entry;
  }
}
class MemoryFile implements WorkspaceFileHandle {
  kind = "file" as const;
  name: string;
  blob: Blob;
  writes: string[];
  path: string;
  failAt: string;
  constructor(name: string, blob: Blob, writes: string[], path: string, failAt = "") { this.name = name; this.blob = blob; this.writes = writes; this.path = path; this.failAt = failAt; }
  async getFile() { return this.blob; }
  async createWritable() {
    let staged = this.blob;
    return {
      write: async (data: string | Blob) => { if (this.path === this.failAt) throw new Error("simulated write failure"); staged = typeof data === "string" ? textBlob(data) : data; },
      close: async () => { this.blob = staged; this.writes.push(this.path); },
      abort: async () => {},
    };
  }
}

test("directory save writes manifest last, reads nested folders, and preserves unrelated files", async () => {
  const workspace = await loadWorkspace(new Map([["notes/a.md", textBlob("# A\n")], ["papers/a.pdf", pdf()]]));
  const directory = new MemoryDirectory();
  directory.entries.set("unrelated.txt", new MemoryFile("unrelated.txt", textBlob("keep"), directory.writes, "unrelated.txt"));
  await saveDirectory(directory, workspace);
  assert.equal(directory.writes.at(-1), "workspace.json");
  assert.equal(await (await directory.getFileHandle("unrelated.txt")).blob.text(), "keep");
  const reopened = await loadWorkspace(await readDirectory(directory));
  assert.deepEqual(reopened.project, workspace.project);
  assert.equal(reopened.documents[workspace.project.nodes.find((node) => node.kind === "markdown")!.id], "# A\n");
});

test("prevalidation prevents all writes for missing content and destination collisions", async () => {
  const missing = await loadWorkspace(new Map([["workspace.json", manifestBlob(projectWithNotes())]]));
  const directory = new MemoryDirectory();
  await assert.rejects(saveDirectory(directory, missing), /缺少正文/);
  assert.equal(directory.entries.size, 0);
  const workspace = await loadWorkspace(new Map([["notes/a.md", textBlob("# A")]]));
  directory.entries.set("Notes", new MemoryDirectory("Notes"));
  await assert.rejects(saveDirectory(directory, workspace), /大小写冲突/);
  assert.equal(directory.writes.length, 0);
  const parentFile = new MemoryDirectory();
  parentFile.entries.set("notes", new MemoryFile("notes", textBlob("file"), parentFile.writes, "notes"));
  await assert.rejects(saveDirectory(parentFile, workspace), /父路径已是文件/);
  assert.equal(parentFile.writes.length, 0);
});

test("resource write failure leaves the previous manifest intact", async () => {
  const workspace = await loadWorkspace(new Map([["note.md", textBlob("new content")], ["reference.pdf", pdf()]]));
  const directory = new MemoryDirectory("root", [], "", "note.md");
  directory.entries.set("workspace.json", new MemoryFile("workspace.json", textBlob("old manifest"), directory.writes, "workspace.json"));
  await assert.rejects(saveDirectory(directory, workspace), /simulated write failure/);
  assert.equal(await (await directory.getFileHandle("workspace.json")).blob.text(), "old manifest");
  assert.equal(directory.writes.includes("workspace.json"), false);
});
