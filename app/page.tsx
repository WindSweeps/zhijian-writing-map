"use client";

import { useMemo, useState } from "react";

type Mode = "linear" | "map";
type Block = {
  id: string;
  index: string;
  title: string;
  eyebrow: string;
  body: string;
  quote?: string;
  image?: string;
  ref?: { label: string; url: string; note: string };
};

const blocks: Block[] = [
  {
    id: "opening", index: "01", eyebrow: "开场 · 场景", title: "从一张无人认领的椅子开始",
    body: "凌晨四点，候机厅的灯仍然亮得没有感情。最靠近落地窗的位置，留着一张没有人坐的椅子。故事不是从一个人开始，而是从一个人留下的空缺开始。",
    image: "airport",
    ref: { label: "空间与非地方", url: "placesjournal.org/non-place", note: "机场作为“非地方”：人在其中流动，却很少真正停留。可用于强化开场的疏离感。" },
  },
  {
    id: "memory", index: "02", eyebrow: "第一幕 · 记忆", title: "那些被遗忘的声音",
    body: "广播第三次念出同一个名字。每次发音都略有不同，像记忆在反复复述中改变形状。她突然记起，父亲也总是念错她朋友的名字。",
    quote: "记忆不是仓库，而是一场每次都会重新排练的戏。",
    ref: { label: "记忆的重构", url: "theconversation.com/memory", note: "记忆在每次提取时都可能被改写。角色的回忆不必可靠，这会成为后文转折的依据。" },
  },
  {
    id: "choice", index: "03", eyebrow: "第二幕 · 选择", title: "留下，还是登机",
    body: "登机口开始关闭。屏幕上的倒计时没有催促她，只是把选择切成一秒一秒、无法复原的薄片。她把护照翻到照片那页，又合上。",
    ref: { label: "选择的时间性", url: "plato.stanford.edu/time", note: "把抽象的选择转化成可感知的时间压力。此处可以与开场的静止座椅形成对照。" },
  },
];

const branchColors = ["#d96c52", "#527a68", "#5575a8", "#a97b42", "#806b9b"];

function TinyIcon({ children }: { children: React.ReactNode }) {
  return <span className="tiny-icon" aria-hidden="true">{children}</span>;
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("linear");
  const [active, setActive] = useState("memory");
  const [refsOpen, setRefsOpen] = useState<Record<string, boolean>>({ opening: true, memory: true, choice: true });
  const [focus, setFocus] = useState(false);
  const [saved, setSaved] = useState(true);
  const [branchColor, setBranchColor] = useState("#d96c52");
  const [overrideColor, setOverrideColor] = useState<string | null>("#5575a8");
  const activeBlock = useMemo(() => blocks.find((item) => item.id === active) ?? blocks[0], [active]);

  const markEditing = () => {
    setSaved(false);
    window.setTimeout(() => setSaved(true), 900);
  };

  return (
    <main className={`writer-app ${focus ? "is-focus" : ""}`}>
      <header className="topbar">
        <div className="brand"><span className="brand-glyph">枝</span><strong>枝间</strong><span className="brand-sub">WRITING MAP</span></div>
        <div className="doc-name"><span className="status-dot" />长篇随笔 / <strong>候机厅里的时间</strong><button aria-label="重命名文稿">⌄</button></div>
        <div className="top-actions">
          <span className="save-state">{saved ? "已保存" : "保存中…"}</span>
          <button className="quiet-btn" onClick={() => setFocus(!focus)}><TinyIcon>◐</TinyIcon>{focus ? "退出专注" : "专注"}</button>
          <button className="share-btn">分享 <span>↗</span></button>
          <button className="avatar" aria-label="个人账户">栩</button>
        </div>
      </header>

      <div className="modebar">
        <div className="mode-tabs" aria-label="视图模式">
          <button className={mode === "linear" ? "active" : ""} onClick={() => setMode("linear")}><TinyIcon>☷</TinyIcon>线性</button>
          <button className={mode === "map" ? "active" : ""} onClick={() => setMode("map")}><TinyIcon>⌘</TinyIcon>Map</button>
        </div>
        <div className="tools"><button title="撤销">↶</button><button title="重做">↷</button><span /><button title="搜索">⌕</button><button title="更多">•••</button></div>
      </div>

      {mode === "linear" ? (
        <div className="linear-layout">
          <aside className="outline-panel">
            <div className="panel-heading"><span>大纲</span><button aria-label="添加章节">＋</button></div>
            <nav>
              <button className="outline-root active"><span className="drag">⠿</span><span className="tree-dot" />候机厅里的时间</button>
              {blocks.map((block) => (
                <button key={block.id} className={`outline-item ${active === block.id ? "active" : ""}`} onClick={() => setActive(block.id)}>
                  <span className="outline-num">{block.index}</span><span>{block.title}</span>
                </button>
              ))}
            </nav>
            <button className="add-block">＋ 添加内容块</button>
            <div className="word-count"><span>⌁</span><div><strong>1,284</strong><small>字 · 约 5 分钟</small></div></div>
          </aside>

          <section className="manuscript" aria-label="正文编辑区">
            <div className="paper-meta"><span>最后编辑于 刚刚</span><span>···</span></div>
            <div className="title-block"><p>非虚构随笔 · 初稿</p><h1 contentEditable suppressContentEditableWarning onInput={markEditing}>候机厅里的<br />时间</h1><div className="title-rule"><span /></div></div>
            {blocks.map((block) => (
              <article key={block.id} className={`content-block ${active === block.id ? "selected" : ""}`} onClick={() => setActive(block.id)}>
                <div className="block-index">{block.index}</div>
                <div className="block-content">
                  <p className="eyebrow">{block.eyebrow}</p>
                  <h2 contentEditable suppressContentEditableWarning onInput={markEditing}>{block.title}</h2>
                  <p className="body-copy" contentEditable suppressContentEditableWarning onInput={markEditing}>{block.body}</p>
                  {block.image && <div className="editorial-image" role="img" aria-label="清晨的机场候机厅"><div className="window-light" /><div className="chair one" /><div className="chair two" /><span>04:17 AM</span></div>}
                  {block.quote && <blockquote contentEditable suppressContentEditableWarning onInput={markEditing}>“{block.quote}”</blockquote>}
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
                {refsOpen[block.id] && <div className="ref-body"><a href={`https://${block.ref.url}`} target="_blank" rel="noreferrer">{block.ref.url} ↗</a><p contentEditable suppressContentEditableWarning onInput={markEditing}>{block.ref.note}</p><div className="ref-tags"><span># 场景</span><span># 理论</span></div></div>}
              </div>
            ) : null)}
            <button className="add-reference">＋ 添加引用</button>
            <div className="side-note"><span>旁注</span><textarea defaultValue="这里的节奏可以再慢一点。让读者先看见空间，再听见广播。" onChange={markEditing} /><small>仅自己可见</small></div>
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
            <div className="map-node root-node"><small>主题</small><h2>候机厅里的时间</h2><p>一篇关于离开、记忆与选择的随笔</p><div className="node-actions"><span>1,284 字</span><button>＋</button></div></div>
            {blocks.map((block, idx) => <div key={block.id} className={`map-node branch-node node-${idx + 1}`} style={{ borderTopColor: branchColor }} onClick={() => setActive(block.id)}><small>{block.eyebrow}</small><h3>{block.title}</h3><p>{block.body.slice(0, 48)}…</p><span className="node-ref">↗ 1 条引用</span></div>)}
            <div className="map-node child-node" style={{ borderTopColor: overrideColor ?? branchColor }}><small>细节 · 伏笔</small><h3>父亲念错的名字</h3><p>记忆的不可靠性，在这里第一次露出裂缝。</p><span className="node-ref">⊙ 颜色已覆盖</span></div>
            <button className="floating-add">＋ 添加分支</button>
            <div className="color-popover">
              <div><strong>分支颜色</strong><small>应用到所有子级</small></div>
              <div className="swatches">{branchColors.map((color) => <button key={color} aria-label={`选择颜色 ${color}`} className={branchColor === color ? "active" : ""} style={{ background: color }} onClick={() => setBranchColor(color)} />)}</div>
              <label><input type="checkbox" checked={overrideColor !== null} onChange={(e) => setOverrideColor(e.target.checked ? "#5575a8" : null)} /> 子子块单独覆盖颜色</label>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
