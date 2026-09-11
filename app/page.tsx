"use client";

import { useMemo, useRef, useState } from "react";

type Mode = "linear" | "map";
type Block = {
  id: string;
  index: string;
  title: string;
  eyebrow: string;
  body: string;
  quote?: string;
  image?: string;
  imagePath?: string;
  bodyFile?: string;
  ref?: { label: string; url: string; note: string };
};

const initialBlocks: Block[] = [
  {
    id: "opening", index: "01", eyebrow: "第一章 · 美术馆", title: "东馆的黄昏",
    body: "训练结束后，他带着还没散尽的草屑气息走进东馆。她靠在浅色石墙边，圆框眼镜后是一双安静的眼睛。两个人从萨特谈到加缪：如果世界没有预设的意义，人是否仍要为自己的每一次选择负责？",
    image: "chapter-one-terrace.png",
    imagePath: "assets/chapter-one-terrace.png",
    ref: { label: "存在主义是一种人道主义", url: "plato.stanford.edu/entries/existentialism", note: "学姐不直接讲解理论，而是把“存在先于本质”变成对男主的追问：足球、专业和喜欢的人，哪些是他自己选择的？" },
  },
  {
    id: "memory", index: "02", eyebrow: "人物线 · 学妹", title: "球场边的绿色小熊",
    body: "学妹总能让沉闷的训练场热闹起来。她穿着 Teenie Weenie 小熊绿色衬衫和牛仔短裤，齐刘海下的眼睛亮得藏不住情绪，半扎马尾随着她挥手的动作轻轻晃动。",
    quote: "你踢球的时候那么果断，怎么下了场反而什么都不敢说？",
    ref: { label: "学妹人物卡", url: "en.wikipedia.org/wiki/Characterization", note: "关键词：活泼、外向、直球。她代表男主熟悉而有生命力的校园日常，也会主动推动两人的关系。" },
  },
  {
    id: "choice", index: "03", eyebrow: "人物线 · 学姐", title: "回望他的那一刻",
    body: "谈话结束时，学姐先走上露台。偏蓝的长发被风吹向身后，短上衣和长裙把她的身影留在夕阳与石墙之间。男主叫住她，她扶了一下圆框眼镜，回过头看向他。",
    ref: { label: "第一章重要 CG", url: "www.nga.gov/visit/tours-and-guides/east-building", note: "构图：男主视角，夕阳露台，现代几何建筑形成引导线。学姐回望镜头，气氛克制、文艺，并留下感情线悬念。" },
  },
];

const branchColors = ["#d96c52", "#527a68", "#5575a8", "#a97b42", "#806b9b"];

function TinyIcon({ children }: { children: React.ReactNode }) {
  return <span className="tiny-icon" aria-hidden="true">{children}</span>;
}

export default function Home() {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [workspaceTitle, setWorkspaceTitle] = useState("越过黄昏的长传");
  const [workspaceKind, setWorkspaceKind] = useState("校园恋爱视觉小说");
  const [mode, setMode] = useState<Mode>("linear");
  const [active, setActive] = useState("memory");
  const [refsOpen, setRefsOpen] = useState<Record<string, boolean>>({ opening: true, memory: true, choice: true });
  const [focus, setFocus] = useState(false);
  const [saved, setSaved] = useState(true);
  const [branchColor, setBranchColor] = useState("#d96c52");
  const [overrideColor, setOverrideColor] = useState<string | null>("#5575a8");
  const [sideNote, setSideNote] = useState("这里的节奏可以再慢一点。让读者先看见空间，再听见广播。");
  const [workspaceStatus, setWorkspaceStatus] = useState("示例工作区");
  const directoryRef = useRef<any>(null);
  const activeBlock = useMemo(() => blocks.find((item) => item.id === active) ?? blocks[0] ?? { id: "", index: "—", title: "未选择内容块", eyebrow: "", body: "" }, [active, blocks]);
  const wordCount = useMemo(() => blocks.reduce((sum, block) => sum + block.body.replace(/\s/g, "").length, 0), [blocks]);

  const markEditing = () => {
    setSaved(false);
    window.setTimeout(() => setSaved(true), 900);
  };

  const updateBlock = (id: string, patch: Partial<Block>) => {
    setBlocks((current) => current.map((block) => block.id === id ? { ...block, ...patch } : block));
    markEditing();
  };

  const getDirectory = async (root: any, path: string, create = false) => {
    const parts = path.split("/").filter(Boolean);
    let directory = root;
    for (const part of parts) directory = await directory.getDirectoryHandle(part, { create });
    return directory;
  };

  const readPath = async (root: any, path: string) => {
    const parts = path.split("/").filter(Boolean);
    const name = parts.pop();
    if (!name) throw new Error("文件路径为空");
    const directory = await getDirectory(root, parts.join("/"));
    return (await directory.getFileHandle(name)).getFile();
  };

  const writePath = async (root: any, path: string, value: Blob | string) => {
    const parts = path.split("/").filter(Boolean);
    const name = parts.pop();
    if (!name) throw new Error("文件路径为空");
    const directory = await getDirectory(root, parts.join("/"), true);
    const file = await directory.getFileHandle(name, { create: true });
    const writable = await file.createWritable();
    await writable.write(value);
    await writable.close();
  };

  const chooseDirectory = async () => {
    const picker = (window as any).showDirectoryPicker;
    if (!picker) {
      alert("当前浏览器不支持直接读取文件夹。请使用最新版 Chrome 或 Edge 打开此 HTTPS 页面。");
      return null;
    }
    return picker({ mode: "readwrite" });
  };

  const openWorkspace = async () => {
    try {
      const directory = await chooseDirectory();
      if (!directory) return;
      const manifestFile = await readPath(directory, "workspace.json");
      const manifest = JSON.parse(await manifestFile.text());
      if (manifest.version !== 1 || !Array.isArray(manifest.blocks)) throw new Error("workspace.json 格式不受支持");
      const loaded = await Promise.all(manifest.blocks.map(async (block: Block) => {
        const bodyFile = block.bodyFile || `content/${block.index}-${block.id}.md`;
        const body = await (await readPath(directory, bodyFile)).text();
        let image = block.image;
        if (block.imagePath) image = URL.createObjectURL(await readPath(directory, block.imagePath));
        return { ...block, body, bodyFile, image };
      }));
      directoryRef.current = directory;
      setBlocks(loaded);
      setWorkspaceTitle(manifest.title || directory.name);
      setWorkspaceKind(manifest.kind || "写作项目");
      setMode(manifest.view?.mode === "map" ? "map" : "linear");
      setBranchColor(manifest.view?.branchColor || "#d96c52");
      setOverrideColor(manifest.view?.overrideColor ?? null);
      setSideNote(manifest.sideNote || "");
      setActive(loaded[0]?.id || "");
      setRefsOpen(Object.fromEntries(loaded.map((block: Block) => [block.id, true])));
      setSaved(true);
      setWorkspaceStatus(`已连接 · ${directory.name}`);
    } catch (error) {
      if ((error as Error).name !== "AbortError") alert(`无法打开工作区：${(error as Error).message}`);
    }
  };

  const saveWorkspace = async () => {
    try {
      const directory = directoryRef.current || await chooseDirectory();
      if (!directory) return;
      directoryRef.current = directory;
      setSaved(false);
      const serialized = blocks.map((block, index) => ({
        ...block,
        index: String(index + 1).padStart(2, "0"),
        body: undefined,
        image: undefined,
        bodyFile: block.bodyFile || `content/${String(index + 1).padStart(2, "0")}-${block.id}.md`,
      }));
      await Promise.all(blocks.map(async (block, index) => {
        const record = serialized[index];
        await writePath(directory, record.bodyFile, block.body);
        if (block.image && block.imagePath) await writePath(directory, block.imagePath, await (await fetch(block.image)).blob());
      }));
      await writePath(directory, "workspace.json", JSON.stringify({
        version: 1,
        title: workspaceTitle,
        kind: workspaceKind,
        sideNote,
        view: { mode, branchColor, overrideColor },
        blocks: serialized,
      }, null, 2));
      setSaved(true);
      setWorkspaceStatus(`已连接 · ${directory.name}`);
    } catch (error) {
      if ((error as Error).name !== "AbortError") alert(`无法保存工作区：${(error as Error).message}`);
      setSaved(true);
    }
  };

  return (
    <main className={`writer-app ${focus ? "is-focus" : ""}`}>
      <header className="topbar">
        <div className="brand"><span className="brand-glyph">枝</span><strong>枝间</strong><span className="brand-sub">WRITING MAP</span></div>
        <div className="doc-name"><span className="status-dot" />{workspaceKind} / <strong>{workspaceTitle}</strong><button aria-label="重命名文稿">⌄</button></div>
        <div className="top-actions">
          <span className="save-state">{saved ? workspaceStatus : "有未保存修改"}</span>
          <button className="quiet-btn folder-action" onClick={openWorkspace}><TinyIcon>⌑</TinyIcon>打开文件夹</button>
          <button className="quiet-btn folder-action" onClick={saveWorkspace}><TinyIcon>↓</TinyIcon>保存</button>
          <button className="quiet-btn" onClick={() => setFocus(!focus)}><TinyIcon>◐</TinyIcon>{focus ? "退出专注" : "专注"}</button>
          <button className="share-btn">分享 <span>↗</span></button>
          <button className="avatar" aria-label="个人账户">栩</button>
        </div>
      </header>

      <div className="modebar">
        <div className="mode-tabs" aria-label="视图模式">
          <button className={mode === "linear" ? "active" : ""} onClick={() => { setMode("linear"); markEditing(); }}><TinyIcon>☷</TinyIcon>线性</button>
          <button className={mode === "map" ? "active" : ""} onClick={() => { setMode("map"); markEditing(); }}><TinyIcon>⌘</TinyIcon>Map</button>
        </div>
        <div className="tools"><button title="撤销">↶</button><button title="重做">↷</button><span /><button title="搜索">⌕</button><button title="更多">•••</button></div>
      </div>

      {mode === "linear" ? (
        <div className="linear-layout">
          <aside className="outline-panel">
            <div className="panel-heading"><span>大纲</span><button aria-label="添加章节">＋</button></div>
            <nav>
              <button className="outline-root active"><span className="drag">⠿</span><span className="tree-dot" />{workspaceTitle}</button>
              {blocks.map((block) => (
                <button key={block.id} className={`outline-item ${active === block.id ? "active" : ""}`} onClick={() => setActive(block.id)}>
                  <span className="outline-num">{block.index}</span><span>{block.title}</span>
                </button>
              ))}
            </nav>
            <button className="add-block">＋ 添加内容块</button>
            <div className="word-count"><span>⌁</span><div><strong>{wordCount.toLocaleString()}</strong><small>字 · {blocks.length} 个内容块</small></div></div>
          </aside>

          <section className="manuscript" aria-label="正文编辑区">
            <div className="paper-meta"><span>最后编辑于 刚刚</span><span>···</span></div>
            <div className="title-block"><p>{workspaceKind} · 本地工作区</p><h1 contentEditable suppressContentEditableWarning onBlur={(event) => { setWorkspaceTitle(event.currentTarget.textContent || "未命名作品"); markEditing(); }}>{workspaceTitle}</h1><div className="title-rule"><span /></div></div>
            {blocks.map((block) => (
              <article key={block.id} className={`content-block ${active === block.id ? "selected" : ""}`} onClick={() => setActive(block.id)}>
                <div className="block-index">{block.index}</div>
                <div className="block-content">
                  <p className="eyebrow">{block.eyebrow}</p>
                  <h2 contentEditable suppressContentEditableWarning onBlur={(event) => updateBlock(block.id, { title: event.currentTarget.textContent || "未命名内容块" })}>{block.title}</h2>
                  <p className="body-copy" contentEditable suppressContentEditableWarning onBlur={(event) => updateBlock(block.id, { body: event.currentTarget.textContent || "" })}>{block.body}</p>
                  {block.image && <figure className="editorial-image"><img src={block.image} alt={`${block.title}的配图`} /><figcaption>多媒体块 · {block.imagePath || "图片"}</figcaption></figure>}
                  {block.quote && <blockquote contentEditable suppressContentEditableWarning onBlur={(event) => updateBlock(block.id, { quote: (event.currentTarget.textContent || "").replace(/[“”]/g, "") })}>“{block.quote}”</blockquote>}
                  <div className="block-footer"><button>＋</button><span>{block.id === "memory" ? "164" : "126"} 字</span><button aria-label="拖动内容块">⠿</button></div>
                </div>
              </article>
            ))}
            <button className="continue-btn">＋ 继续写作</button>
          </section>

          <aside className="references-panel">
            <div className="panel-heading"><span>引用与旁注</span><button>⌄</button></div>
            <div className="context-label"><span>{activeBlock.index}</span>{activeBlock.title}</div>
            {blocks.map((block) => active === block.id && block.ref ? (
              <div className="reference-card" key={block.id}>
                <button className="ref-header" onClick={() => setRefsOpen((s) => ({ ...s, [block.id]: !s[block.id] }))}>
                  <span className="ref-type">↗</span><span><small>网页引用</small><strong>{block.ref.label}</strong></span><i>{refsOpen[block.id] ? "−" : "+"}</i>
                </button>
                {refsOpen[block.id] && <div className="ref-body"><a href={`https://${block.ref.url}`} target="_blank" rel="noreferrer">{block.ref.url} ↗</a><p contentEditable suppressContentEditableWarning onBlur={(event) => updateBlock(block.id, { ref: { ...block.ref!, note: event.currentTarget.textContent || "" } })}>{block.ref.note}</p><div className="ref-tags"><span># 人物</span><span># 第一章</span></div></div>}
              </div>
            ) : null)}
            <button className="add-reference">＋ 添加引用</button>
            <div className="side-note"><span>旁注</span><textarea value={sideNote} onChange={(event) => { setSideNote(event.target.value); markEditing(); }} /><small>保存在 workspace.json</small></div>
          </aside>
        </div>
      ) : (
        <section className="map-workspace">
          <div className="map-toolbar">
            <div><strong>故事结构图</strong><span>拖动卡片整理叙事关系</span></div>
            <div className="zoom"><button>−</button><span>86%</span><button>＋</button><button>适应画布</button></div>
          </div>
          <div className="map-canvas">
            <div className="map-grid" />
            <svg className="connectors" viewBox="0 0 1200 650" preserveAspectRatio="none" aria-hidden="true">
              <path d="M 375 320 C 465 320, 445 145, 545 145" style={{ stroke: branchColor }} />
              <path d="M 375 320 C 470 320, 465 325, 545 325" style={{ stroke: branchColor }} />
              <path d="M 375 320 C 465 320, 445 510, 545 510" style={{ stroke: branchColor }} />
              <path d="M 805 325 C 890 325, 865 235, 945 235" style={{ stroke: overrideColor ?? branchColor }} />
            </svg>
            <div className="map-node root-node"><small>主题</small><h2>{workspaceTitle}</h2><p>{workspaceKind} · {blocks.length} 个内容块</p><div className="node-actions"><span>{wordCount} 字</span><button>＋</button></div></div>
            {blocks.map((block, idx) => <div key={block.id} className={`map-node branch-node node-${idx + 1}`} style={{ borderTopColor: branchColor }} onClick={() => setActive(block.id)}><small>{block.eyebrow}</small><h3>{block.title}</h3><p>{block.body.slice(0, 48)}…</p><span className="node-ref">↗ 1 条引用</span></div>)}
            <div className="map-node child-node" style={{ borderTopColor: overrideColor ?? branchColor }}><small>男主 · 核心矛盾</small><h3>选择自己的位置</h3><p>球场上习惯前锋位置的他，第一次无法判断该往哪里跑。</p><span className="node-ref">⊙ 颜色已覆盖</span></div>
            <button className="floating-add">＋ 添加分支</button>
            <div className="color-popover">
              <div><strong>分支颜色</strong><small>应用到所有子级</small></div>
              <div className="swatches">{branchColors.map((color) => <button key={color} aria-label={`选择颜色 ${color}`} className={branchColor === color ? "active" : ""} style={{ background: color }} onClick={() => { setBranchColor(color); markEditing(); }} />)}</div>
              <label><input type="checkbox" checked={overrideColor !== null} onChange={(e) => { setOverrideColor(e.target.checked ? "#5575a8" : null); markEditing(); }} /> 子子块单独覆盖颜色</label>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
