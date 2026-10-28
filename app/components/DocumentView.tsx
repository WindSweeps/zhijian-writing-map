"use client";

// Project document viewers: react-markdown and pdf.js supply the parsers; this
// component adds workspace-relative links and the local-file rendering lifecycle.
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";

type DocumentTarget =
  | { kind: "external"; url: string }
  | { kind: "local"; path: string; fragment: string; page?: number }
  | { kind: "invalid" };

/** Resolve a Markdown URL inside the project without allowing parent escape. */
function documentTarget(value: string | undefined, sourcePath: string): DocumentTarget {
  if (!value) return { kind: "invalid" };
  const href = value.trim();
  if (/^https?:\/\//i.test(href)) {
    try {
      const url = new URL(href);
      return url.protocol === "http:" || url.protocol === "https:"
        ? { kind: "external", url: url.href }
        : { kind: "invalid" };
    } catch {
      return { kind: "invalid" };
    }
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//")) return { kind: "invalid" };
  try {
    const hashIndex = href.indexOf("#");
    const fragment = hashIndex < 0 ? "" : decodeURIComponent(href.slice(hashIndex + 1));
    const beforeHash = hashIndex < 0 ? href : href.slice(0, hashIndex);
    const queryIndex = beforeHash.indexOf("?");
    const query = queryIndex < 0 ? "" : beforeHash.slice(queryIndex + 1);
    const encodedPath = queryIndex < 0 ? beforeHash : beforeHash.slice(0, queryIndex);
    const pathname = decodeURIComponent(encodedPath);
    if (/[\u0000-\u001f\\]/.test(pathname) || /^[a-z][a-z\d+.-]*:/i.test(pathname) || pathname.startsWith("//")) {
      return { kind: "invalid" };
    }
    const parts = pathname.startsWith("/") ? [] : sourcePath.split("/").slice(0, -1);
    const destination = pathname || sourcePath.split("/").at(-1) || "";
    for (const part of destination.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") {
        if (!parts.length) return { kind: "invalid" };
        parts.pop();
      } else {
        parts.push(part);
      }
    }
    const path = parts.join("/");
    if (!path) return { kind: "invalid" };
    const pageValue = new URLSearchParams(fragment).get("page") || new URLSearchParams(query).get("page");
    const requestedPage = pageValue && /^\d+$/.test(pageValue) ? Number(pageValue) : undefined;
    const page = requestedPage && Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : undefined;
    return { kind: "local", path, fragment, page };
  } catch {
    return { kind: "invalid" };
  }
}

function useBlobUrl(file?: Blob) {
  const [resource, setResource] = useState<{ file: Blob; url: string } | null>(null);
  useEffect(() => {
    if (!file) {
      setResource(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setResource({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return resource?.file === file ? resource?.url : undefined;
}

function MarkdownImage({ src, alt, title, path, assets }: {
  src?: string;
  alt?: string;
  title?: string;
  path: string;
  assets: Record<string, Blob>;
}) {
  const target = documentTarget(src, path);
  const file = target.kind === "local" ? assets[target.path] : undefined;
  const blobUrl = useBlobUrl(file);
  const url = target.kind === "external" ? target.url : blobUrl;
  const [failedUrl, setFailedUrl] = useState<string>();
  if (url && failedUrl !== url) {
    // Local object URLs are not handled by Next's remote image optimizer.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="markdown-image" src={url} alt={alt || "文档图片"} title={title} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />;
  }
  return <span className="doc-missing-image" role="status">{alt || "图片"} · {file && !blobUrl ? "正在载入" : "无法显示图片"}{target.kind === "local" ? `（${target.path}）` : ""}</span>;
}

function MarkdownLink({ href, title, children, path, assets, onNavigate }: {
  href?: string;
  title?: string;
  children: React.ReactNode;
  path: string;
  assets: Record<string, Blob>;
  onNavigate: (path: string, page?: number) => void;
}) {
  const target = documentTarget(href, path);
  const isDocument = target.kind === "local" && /\.(?:md|markdown|pdf)$/i.test(target.path);
  const file = target.kind === "local" && !isDocument ? assets[target.path] : undefined;
  const blobUrl = useBlobUrl(file);
  if (target.kind === "external") {
    return <a href={target.url} title={title} target="_blank" rel="noopener noreferrer">{children}<span className="doc-external-mark" aria-hidden="true"> ↗</span></a>;
  }
  if (target.kind === "local" && isDocument) {
    // Keep the href inside this page so a middle click cannot request a private
    // workspace filename from the public web host.
    return <a href={`#workspace-file=${encodeURIComponent(target.path)}${target.page ? `&page=${target.page}` : ""}`} title={title || target.path} onClick={(event) => {
      event.preventDefault();
      onNavigate(target.path, target.page);
    }}>{children}</a>;
  }
  if (target.kind === "local" && blobUrl) {
    return <a href={blobUrl} download={target.path.split("/").at(-1)} title={title || target.path}>{children}</a>;
  }
  return <span className="doc-unavailable-link" title={target.kind === "local" ? `工程中未找到：${target.path}` : "此链接格式不受支持"}>{children}</span>;
}

export function MarkdownPreview({ text, path, assets, onNavigate }: {
  text: string;
  path: string;
  assets: Record<string, Blob>;
  onNavigate: (path: string, page?: number) => void;
}) {
  if (!text.trim()) return <div className="doc-empty">这份 Markdown 还没有内容。</div>;
  return <article className="markdown-preview" aria-label="Markdown 预览">
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={(value) => value} components={{
      a: ({ href, title, children }) => <MarkdownLink href={href} title={title} path={path} assets={assets} onNavigate={onNavigate}>{children}</MarkdownLink>,
      img: ({ src, alt, title }) => <MarkdownImage src={typeof src === "string" ? src : undefined} alt={alt} title={title} path={path} assets={assets} />,
      table: ({ children }) => <div className="markdown-table-scroll" tabIndex={0} role="region" aria-label="表格"><table>{children}</table></div>,
    }}>{text}</ReactMarkdown>
  </article>;
}

function pageWithinBounds(value: number, count: number) {
  return Math.min(Math.max(Number.isFinite(value) ? Math.trunc(value) : 1, 1), Math.max(count, 1));
}

export function PDFReader({ file, page, onPageChange }: {
  file?: Blob;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState<{ file: Blob; document: PDFDocumentProxy } | null>(null);
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [renderError, setRenderError] = useState("");
  const [availableWidth, setAvailableWidth] = useState(0);
  const [pageInput, setPageInput] = useState(String(page));
  const fileUrl = useBlobUrl(file);
  // A newly selected file must never be clamped to the previous file's length.
  const document = loaded && loaded.file === file ? loaded.document : null;
  const pageCount = document?.numPages || 0;
  const currentPage = pageWithinBounds(page, pageCount);
  const inputPage = pageInput.trim() && Number.isFinite(Number(pageInput)) ? pageWithinBounds(Number(pageInput), pageCount) : currentPage;

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    if (document && page !== currentPage) onPageChange(currentPage);
  }, [document, currentPage, page, onPageChange]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let frame = 0;
    const updateWidth = (width: number) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setAvailableWidth(Math.max(0, Math.floor(width))));
    };
    const measure = () => {
      const style = getComputedStyle(stage);
      updateWidth(stage.clientWidth - parseFloat(style.paddingLeft || "0") - parseFloat(style.paddingRight || "0"));
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(([entry]) => updateWidth(entry.contentRect.width)) : undefined;
    observer?.observe(stage);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let passwordRequired = false;
    let task: PDFDocumentLoadingTask | undefined;
    setLoaded(null);
    setLoadError("");
    setRenderError("");
    setLoading(Boolean(file));
    if (!file) return;
    void (async () => {
      try {
        const [pdfjs, data] = await Promise.all([import("pdfjs-dist"), file.arrayBuffer()]);
        if (cancelled) return;
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
        pdfjs.GlobalWorkerOptions.workerSrc = `${basePath}/pdf.worker.min.mjs`;
        task = pdfjs.getDocument({
          data: new Uint8Array(data),
          cMapUrl: `${basePath}/pdf-cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${basePath}/pdf-fonts/`,
          wasmUrl: `${basePath}/pdf-wasm/`,
          isEvalSupported: false,
        });
        task.onPassword = () => {
          if (cancelled) return;
          passwordRequired = true;
          setLoadError("这份 PDF 需要密码。请在系统阅读器中打开，或导入未加密副本。");
          setLoading(false);
          void task?.destroy().catch(() => {});
        };
        const loadedDocument = await task.promise;
        if (cancelled) return;
        setLoaded({ file, document: loadedDocument });
        setLoading(false);
      } catch (error) {
        if (cancelled || passwordRequired) return;
        setLoading(false);
        setLoadError(`无法读取 PDF：${error instanceof Error ? error.message : "文件可能已损坏"}`);
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy().catch(() => {});
    };
  }, [file]);

  useEffect(() => {
    let cancelled = false;
    let task: RenderTask | undefined;
    const canvas = canvasRef.current;
    setRenderError("");
    if (!document || !canvas || !availableWidth) {
      setRendering(false);
      return;
    }
    setRendering(true);
    void (async () => {
      try {
        const pdfPage = await document.getPage(currentPage);
        if (cancelled) return;
        const naturalViewport = pdfPage.getViewport({ scale: 1 });
        const cssWidth = Math.min(availableWidth, 1400);
        const viewport = pdfPage.getViewport({ scale: cssWidth / naturalViewport.width });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("浏览器无法创建 PDF 画布");
        canvas.width = Math.ceil(viewport.width * pixelRatio);
        canvas.height = Math.ceil(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        task = pdfPage.render({ canvas, canvasContext: context, viewport, transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0] });
        await task.promise;
        if (!cancelled) setRendering(false);
      } catch (error) {
        if (cancelled || (error instanceof Error && error.name === "RenderingCancelledException")) return;
        setRendering(false);
        setRenderError(`这一页无法显示：${error instanceof Error ? error.message : "请尝试重新打开文件"}`);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [document, currentPage, availableWidth]);

  const commitPage = () => {
    if (!pageCount) return;
    const nextPage = inputPage;
    setPageInput(String(nextPage));
    if (nextPage !== page) onPageChange(nextPage);
  };

  const stepPage = (direction: number) => {
    if (!pageCount) return;
    const nextPage = pageWithinBounds(inputPage + direction, pageCount);
    setPageInput(String(nextPage));
    if (nextPage !== page) onPageChange(nextPage);
  };

  return <section className="pdf-reader" aria-label="PDF 阅读器">
    <div className="pdf-toolbar">
      <button type="button" className="pdf-page-button" onClick={() => stepPage(-1)} disabled={!document || inputPage <= 1} aria-label="上一页">←</button>
      <form className="pdf-page-form" onSubmit={(event) => { event.preventDefault(); commitPage(); }}>
        <label>第 <input aria-label="PDF 页码" type="number" min={1} max={pageCount || 1} step={1} value={pageInput} disabled={!document} onChange={(event) => setPageInput(event.target.value)} onBlur={commitPage} /> 页</label>
        <span className="pdf-page-count">/ {pageCount || "—"}</span>
      </form>
      <button type="button" className="pdf-page-button" onClick={() => stepPage(1)} disabled={!document || inputPage >= pageCount} aria-label="下一页">→</button>
      {fileUrl && <a className="pdf-open-link" href={`${fileUrl}#page=${currentPage}`} target="_blank" rel="noopener noreferrer">单独打开 ↗</a>}
    </div>
    <div className="pdf-canvas-stage" ref={stageRef} aria-busy={loading || rendering}>
      {!file && <p className="doc-empty">未找到这份 PDF，请检查工程中的文件路径。</p>}
      {loading && <p className="pdf-status" role="status">正在读取 PDF…</p>}
      {(loadError || renderError) && <p className="pdf-error" role="alert">{loadError || renderError}</p>}
      {document && !loadError && <>
        {rendering && <span className="pdf-render-status" role="status">正在显示第 {currentPage} 页…</span>}
        <canvas key={`${document.fingerprints[0]}-${currentPage}`} ref={canvasRef} className="pdf-canvas" aria-label={`PDF 第 ${currentPage} 页，共 ${pageCount} 页`} role="img" style={{ visibility: rendering || renderError ? "hidden" : "visible" }} />
      </>}
    </div>
  </section>;
}
