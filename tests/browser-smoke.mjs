/**
 * Repository-specific browser regression: actual static Pages export, no private files.
 * Existing workspace unit tests cover serialization but cannot exercise canvas rendering,
 * browser ZIP downloads, keyboard/pointer controls, or responsive panel visibility.
 * Run after GITHUB_ACTIONS=true npm run build with PLAYWRIGHT_MODULE set to the
 * installed Playwright module if it is not available through ordinary Node resolution.
 * A successful exit and JSON report mean synthetic data round-tripped byte-for-byte;
 * screenshots in the temporary directory still require human visual inspection.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = resolve(fileURLToPath(new URL("../out", import.meta.url)));
const base = "/zhijian-writing-map";
const report = { passed: [], screenshots: [], layouts: [], consoleErrors: [], pageErrors: [], failedRequests: [] };
const mime = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".wasm": "application/wasm", ".ttf": "font/ttf", ".woff2": "font/woff2" };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/favicon.ico") { res.writeHead(204); res.end(); return; }
    if (!(url.pathname === base || url.pathname.startsWith(`${base}/`))) { res.writeHead(404); res.end(); return; }
    let target = resolve(root, `.${decodeURIComponent(url.pathname.slice(base.length) || "/")}`);
    if (target !== root && !target.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    if ((await stat(target)).isDirectory()) target = join(target, "index.html");
    res.writeHead(200, { "Content-Type": mime[extname(target)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(await readFile(target));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}${base}/`;

function makePDF(count = 2) {
  const pages = Array.from({ length: count }, (_, i) => `BT /F1 24 Tf 35 240 Td (SYNTHETIC REFERENCE PAGE ${i === 0 ? "ONE" : "TWO"}) Tj ET`);
  const fontId = count + 3;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${count} /Kids [${pages.map((_, i) => `${i + 3} 0 R`).join(" ")}] >>`,
    ...pages.map((_, i) => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 300] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${fontId + i + 1} 0 R >>`),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...pages.map(content => `<< /Length ${content.length} >>\nstream\n${content}\nendstream`),
  ];
  let text = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, body] of objects.entries()) { offsets.push(Buffer.byteLength(text)); text += `${index + 1} 0 obj\n${body}\nendobj\n`; }
  const xref = Buffer.byteLength(text);
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  text += offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(text);
}
const node = (id, kind, path, x, y) => ({ id, kind, path, title: id, parentId: null, color: null, position: { x, y }, page: 1, note: "" });
const project = { format: "zhijian", version: 2, title: "Synthetic writing project", nodes: [node("Research note", "markdown", "notes/note.md", 40, 50), node("Reference PDF", "pdf", "sources/reference.pdf", 350, 210), node("Related note", "markdown", "notes/related.md", 40, 350)], links: [], view: { mode: "map", zoom: 1 }, sideNote: "" };
const markdown = "# Synthetic research\n\nRead the [second reference page](../sources/reference.pdf#page=2).\n\n![Test image](../assets/test.png)\n\n- First observation\n- Second observation\n";
const revised = `${markdown}\n## Added in browser\n\nMultiple lines survive editing.\nA second line with 中文正文。\n\n| Item | Value |\n| --- | --- |\n| A | B |\n`;
const pdf = makePDF();
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZV8AAAAASUVORK5CYII=", "base64");
const files = { "workspace.json": strToU8(JSON.stringify(project)), "notes/note.md": strToU8(markdown), "notes/related.md": strToU8("# Related material\n\nIndependent note.\n"), "sources/reference.pdf": pdf, "assets/test.png": png };
const inputArchive = Buffer.from(zipSync(files));
let browser;
let page;
async function check(name, run) { await run(); report.passed.push(name); console.log(`PASS ${name}`); }
async function shot(name) { const path = join(process.env.SMOKE_ARTIFACT_DIR || "/private/tmp", `zhijian-demo-${name}.png`); await page.screenshot({ path, fullPage: true }); report.screenshots.push(path); }
async function upload(buffer, name = "synthetic-workspace.zip") { await page.getByLabel("打开工程 ZIP", { exact: true }).setInputFiles({ name, mimeType: "application/zip", buffer }); }
async function fileSelect(title) { await page.locator(".file-row").filter({ has: page.locator("strong", { hasText: title }) }).click(); }
async function relations() { await page.locator(".reader-tabs").getByRole("button", { name: /^关联/ }).click(); }
async function pdfReady(pageNumber) {
  await page.locator(`canvas[aria-label="PDF 第 ${pageNumber} 页，共 2 页"]`).waitFor({ state: "visible", timeout: 20000 });
  await page.waitForFunction(() => document.querySelector(".pdf-canvas-stage")?.getAttribute("aria-busy") === "false" && document.querySelector("canvas")?.width > 0);
}
async function layout(width, name, enlarged = false) {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(enlarged => { document.documentElement.style.fontSize = enlarged ? "32px" : ""; }, enlarged);
  await page.waitForTimeout(100);
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const visible = element => !!(element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
    const controls = [...document.querySelectorAll(".app-header button,.workspace-bar button,.mobile-tabs button")].filter(visible).map(e => { const r = e.getBoundingClientRect(); return { text: e.textContent.trim(), x: r.x, right: r.right, y: r.y, bottom: r.bottom }; });
    const panels = [...document.querySelectorAll(".workspace-grid > *")].filter(visible).map(e => ({ class: e.className, width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height }));
    return { width: innerWidth, scrollWidth: root.scrollWidth, height: innerHeight, controls, panels };
  });
  report.layouts.push({ name, enlarged, width: result.width, scrollWidth: result.scrollWidth, panels: result.panels });
  assert.ok(result.scrollWidth <= width + 1, `${name}: horizontal page overflow ${result.scrollWidth}/${width}`);
  assert.ok(result.controls.every(control => control.x >= -1 && control.right <= width + 1 && control.bottom <= 901), `${name}: controls outside viewport`);
  assert.ok(result.panels.every(panel => panel.height > 150), `${name}: content panel collapsed`);
  await shot(name);
}
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  page = await context.newPage();
  page.on("console", msg => { if (msg.type() === "error") report.consoleErrors.push(msg.text()); });
  page.on("pageerror", error => report.pageErrors.push(error.message));
  page.on("requestfailed", request => report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on("dialog", dialog => dialog.accept());
  await page.goto(origin, { waitUntil: "networkidle" });
  await check("blank default has only functionality, no legacy story", async () => {
    assert.equal(await page.locator(".map-node").count(), 0);
    assert.match(await page.locator("body").innerText(), /Markdown 笔记/);
    assert.doesNotMatch(await page.locator("body").innerText(), /夕阳|学姐|学妹|存在主义|Teenie|第一章/i);
  });
  await check("empty responsive widths and 200 percent text", async () => {
    for (const width of [1440, 1024, 961, 960, 390]) await layout(width, `empty-${width}`);
    await layout(1440, "empty-1440-text200", true);
    await layout(390, "empty-390-text200", true);
    const blankNote = page.getByRole("button", { name: "新建空白笔记", exact: true });
    await blankNote.scrollIntoViewIfNeeded();
    const blankNoteBox = await blankNote.boundingBox();
    assert.ok(blankNoteBox.y >= 0 && blankNoteBox.y + blankNoteBox.height <= 901, "empty controls remain reachable with enlarged text");
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    await page.setViewportSize({ width: 1440, height: 900 });
  });
  await check("ZIP import restores files and Markdown exactly", async () => {
    await upload(inputArchive);
    await page.getByLabel("节点标题", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("工程名称").inputValue(), project.title);
    assert.equal(await page.locator(".map-node").count(), 3);
    assert.equal(await page.getByLabel("Markdown 正文").inputValue(), markdown);
  });
  await check("edit Markdown, preview local image, follow PDF page link", async () => {
    await page.getByLabel("Markdown 正文").fill(revised);
    await page.getByRole("button", { name: "预览", exact: true }).click();
    assert.match(await page.getByLabel("Markdown 预览").innerText(), /Added in browser/);
    await page.waitForFunction(() => document.querySelector(".markdown-image")?.naturalWidth === 1);
    await page.getByRole("link", { name: "second reference page" }).click();
    await pdfReady(2);
    assert.equal(await page.getByLabel("PDF 页码").inputValue(), "2");
    await shot("pdf-page2");
    await page.getByRole("button", { name: "上一页", exact: true }).click();
    await pdfReady(1);
    await page.getByLabel("PDF 页码").fill("1");
    await page.getByRole("button", { name: "下一页", exact: true }).click();
    await pdfReady(2);
  });
  await check("create PDF page association, hierarchy, inherited color and override", async () => {
    await fileSelect("Research note");
    await relations();
    await page.getByLabel("分支颜色 #496fa3", { exact: true }).click();
    await page.getByLabel("关联目标").selectOption("Reference PDF");
    await page.getByLabel("引用页码").fill("2");
    await page.getByLabel("关系名称").fill("Supporting evidence");
    await page.getByRole("button", { name: "建立关联", exact: true }).click();
    await fileSelect("Related note");
    await relations();
    await page.getByLabel("父节点").selectOption("Research note");
    const relatedCard = page.locator(".map-node").filter({ has: page.getByRole("button", { name: "移动 Related note", exact: true }) });
    assert.equal(await relatedCard.evaluate(e => getComputedStyle(e).borderTopColor), "rgb(73, 111, 163)");
    await page.getByLabel("分支颜色 #a3643e", { exact: true }).click();
    assert.equal(await relatedCard.evaluate(e => getComputedStyle(e).borderTopColor), "rgb(163, 100, 62)");
    await page.getByLabel("文档旁注").fill("Synthetic annotation retained on reopen.");
    assert.equal(await page.locator(".parent-line").count(), 1);
    assert.equal(await page.locator(".reference-line").count(), 1);
  });
  await check("pointer drag and keyboard movement persist positions", async () => {
    const handle = page.getByRole("button", { name: "移动 Research note", exact: true });
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 30, { steps: 5 });
    await page.mouse.up();
    await handle.focus();
    await page.keyboard.press("ArrowRight");
    const card = page.locator(".map-node").filter({ has: handle });
    assert.equal(await card.evaluate(e => e.style.left), "110px");
    assert.equal(await card.evaluate(e => e.style.top), "80px");
  });
  let exported;
  let exportedProject;
  await check("export preserves Markdown, PDF bytes, image and graph metadata", async () => {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出工程", exact: true }).click();
    const download = await pending;
    const path = await download.path();
    exported = await readFile(path);
    const entries = unzipSync(exported);
    assert.deepEqual(Object.keys(entries).sort(), Object.keys(files).sort());
    assert.equal(strFromU8(entries["notes/note.md"]), revised);
    assert.deepEqual(Buffer.from(entries["sources/reference.pdf"]), pdf);
    assert.deepEqual(Buffer.from(entries["assets/test.png"]), png);
    exportedProject = JSON.parse(strFromU8(entries["workspace.json"]));
    assert.deepEqual(exportedProject.nodes[0].position, { x: 110, y: 80 });
    assert.equal(exportedProject.nodes[1].page, 2);
    assert.equal(exportedProject.nodes[2].parentId, "Research note");
    assert.equal(exportedProject.nodes[2].color, "#a3643e");
    assert.equal(exportedProject.nodes[2].note, "Synthetic annotation retained on reopen.");
    assert.equal(exportedProject.links[0].targetPage, 2);
    assert.equal(exportedProject.links[0].label, "Supporting evidence");
  });
  await check("exported ZIP reopens with content and graph intact", async () => {
    await upload(exported, "roundtrip.zip");
    await page.getByRole("button", { name: "源码", exact: true }).click();
    assert.equal(await page.getByLabel("Markdown 正文").inputValue(), revised);
    assert.equal(await page.locator(".parent-line").count(), 1);
    assert.equal(await page.locator(".reference-line").count(), 1);
    const card = page.locator(".map-node").filter({ has: page.getByRole("button", { name: "移动 Research note", exact: true }) });
    assert.equal(await card.evaluate(e => e.style.left), "110px");
    await page.getByRole("button", { name: "线性", exact: true }).click();
    assert.equal(await page.locator(".linear-article").count(), 2);
    await page.locator(".article-references").getByRole("button").first().click();
    await pdfReady(2);
    await page.getByRole("button", { name: "Map", exact: true }).click();
  });
  await check("populated responsive layouts and text enlargement", async () => {
    for (const width of [1440, 1024, 961, 960, 390]) {
      await page.setViewportSize({ width, height: 900 });
      if (width <= 960) await page.getByRole("button", { name: "结构", exact: true }).click();
      await layout(width, `populated-${width}`);
      if (width <= 960) { await page.getByRole("button", { name: "阅读 / 编辑", exact: true }).click(); await pdfReady(2); await shot(`reader-${width}`); }
    }
    await layout(1440, "populated-1440-text200", true);
    await layout(390, "populated-390-text200", true);
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    await page.setViewportSize({ width: 1440, height: 900 });
  });
  await check("malformed manifest is rejected without replacing current workspace", async () => {
    await upload(Buffer.from(zipSync({ "workspace.json": strToU8("{not-json") })), "invalid.zip");
    await page.locator(".message-bar[role=alert]").waitFor();
    assert.match(await page.locator(".message-bar[role=alert]").innerText(), /不是有效的 JSON/);
    assert.equal(await page.locator(".map-node").count(), 3);
  });
  await check("switching PDF documents preserves target page across different lengths", async () => {
    const switching = { ...project, nodes: [node("Short PDF", "pdf", "sources/short.pdf", 40, 50), { ...project.nodes[1], page: 2 }], links: [] };
    await upload(Buffer.from(zipSync({ "workspace.json": strToU8(JSON.stringify(switching)), "sources/short.pdf": makePDF(1), "sources/reference.pdf": pdf })), "switching.zip");
    await page.locator('canvas[aria-label="PDF 第 1 页，共 1 页"]').waitFor({ state: "visible", timeout: 20000 });
    await fileSelect("Reference PDF");
    await pdfReady(2);
    assert.equal(await page.getByLabel("PDF 页码").inputValue(), "2");
  });
  await check("missing PDF produces warning, empty reader and blocked export", async () => {
    const missing = { ...files }; delete missing["sources/reference.pdf"];
    await upload(Buffer.from(zipSync(missing)), "missing-pdf.zip");
    await page.waitForFunction(() => document.querySelector(".message-bar")?.textContent.includes("缺少文件"));
    await fileSelect("Reference PDF");
    assert.match(await page.locator(".pdf-reader").innerText(), /未找到这份 PDF/);
    await page.getByRole("button", { name: "导出工程", exact: true }).click();
    await page.locator(".message-bar[role=alert]").waitFor();
    assert.match(await page.locator(".message-bar[role=alert]").innerText(), /缺少 PDF，未执行保存/);
    await shot("missing-pdf-error");
  });
  await check("fresh note plus direct Markdown/PDF/image imports and duplicate preservation", async () => {
    await page.getByRole("button", { name: "新工程", exact: true }).click();
    await page.getByRole("button", { name: "新建空白笔记", exact: true }).click();
    await page.getByLabel("节点标题", { exact: true }).fill("Fresh note");
    await page.getByLabel("Markdown 正文").fill("# Fresh browser note\n\nWritten from scratch.\n");
    const directMarkdown = "# Imported note\n\n[Page two](source.pdf#page=2)\n\n![Local figure](loose.png)\n";
    await page.getByLabel("导入文件", { exact: true }).setInputFiles([
      { name: "imported.md", mimeType: "text/markdown", buffer: Buffer.from(directMarkdown) },
      { name: "source.pdf", mimeType: "application/pdf", buffer: pdf },
      { name: "loose.png", mimeType: "image/png", buffer: png },
      { name: "spare.png", mimeType: "image/png", buffer: png },
    ]);
    await page.waitForFunction(() => document.querySelectorAll(".map-node").length === 3);
    assert.equal(await page.getByLabel("Markdown 正文").inputValue(), directMarkdown);
    assert.equal(await page.locator(".reference-line").count(), 1);
    await page.getByLabel("导入文件", { exact: true }).setInputFiles({ name: "IMPORTED.md", mimeType: "text/markdown", buffer: Buffer.from("This duplicate must not overwrite original.") });
    await page.waitForFunction(() => document.querySelector(".message-bar")?.textContent.includes("跳过同名文件"));
    assert.equal(await page.locator(".map-node").count(), 3);
    assert.equal(await page.getByLabel("Markdown 正文").inputValue(), directMarkdown);
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出工程", exact: true }).click();
    const directExport = await readFile(await (await pending).path());
    const directEntries = unzipSync(directExport);
    const directProject = JSON.parse(strFromU8(directEntries["workspace.json"]));
    const createdNode = directProject.nodes.find(node => node.title === "Fresh note");
    assert.equal(strFromU8(directEntries[createdNode.path]), "# Fresh browser note\n\nWritten from scratch.\n");
    assert.equal(strFromU8(directEntries["imported.md"]), directMarkdown);
    assert.deepEqual(Buffer.from(directEntries["source.pdf"]), pdf);
    assert.deepEqual(Buffer.from(directEntries["spare.png"]), png);
    assert.ok(directProject.resources.includes("spare.png"), "unreferenced imported image is listed as a retained resource");
    await upload(directExport, "direct-import-roundtrip.zip");
    await page.waitForFunction(() => document.querySelectorAll(".map-node").length === 3);
    const nextExport = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出工程", exact: true }).click();
    const reopenedEntries = unzipSync(await readFile(await (await nextExport).path()));
    assert.deepEqual(Buffer.from(reopenedEntries["spare.png"]), png);
  });
  await check("unsafe direct filename is rejected and workspace retained", async () => {
    await page.getByLabel("导入文件", { exact: true }).setInputFiles({ name: "bad:name.md", mimeType: "text/markdown", buffer: Buffer.from("Unsafe filename") });
    await page.locator(".message-bar[role=alert]").waitFor();
    assert.match(await page.locator(".message-bar[role=alert]").innerText(), /不安全的文件路径/);
    assert.equal(await page.locator(".map-node").count(), 3);
  });
  await check("missing prototype-name resources render safely in a root Markdown file", async () => {
    await page.getByRole("button", { name: "新工程", exact: true }).click();
    await page.getByLabel("导入文件", { exact: true }).setInputFiles({
      name: "note.md", mimeType: "text/markdown",
      buffer: Buffer.from("# Missing resource regression\n\n![缺失图](toString)\n\n[缺失附件](constructor)\n"),
    });
    await page.waitForFunction(() => document.querySelectorAll(".map-node").length === 1);
    await page.getByRole("button", { name: "预览", exact: true }).click();
    await page.locator(".doc-missing-image").waitFor();
    assert.match(await page.locator(".doc-missing-image").innerText(), /缺失图 · 无法显示图片（toString）/);
    assert.equal(await page.locator(".doc-unavailable-link").innerText(), "缺失附件");
    assert.equal(await page.getByRole("link", { name: "缺失附件", exact: true }).count(), 0);
    assert.equal(await page.locator(".markdown-image").count(), 0);
    await shot("missing-prototype-resources");
  });
  assert.deepEqual(report.pageErrors, [], "browser runtime errors");
  assert.deepEqual(report.consoleErrors, [], "browser console errors");
  assert.deepEqual(report.failedRequests, [], "failed browser requests");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.failure = error.stack;
  if (page) await shot("failure").catch(() => {});
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
