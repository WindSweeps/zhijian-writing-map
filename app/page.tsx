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
    id: "opening", index: "01", eyebrow: "第一章 · 美术馆", title: "东馆的黄昏",
    body: "训练结束后，他带着还没散尽的草屑气息走进东馆。她靠在浅色石墙边，圆框眼镜后是一双安静的眼睛。两个人从萨特谈到加缪：如果世界没有预设的意义，人是否仍要为自己的每一次选择负责？",
    image: "terrace",
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
        <div className="doc-name"><span className="status-dot" />校园恋爱视觉小说 / <strong>越过黄昏的长传</strong><button aria-label="重命名文稿">⌄</button></div>
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
              <button className="outline-root active"><span className="drag">⠿</span><span className="tree-dot" />越过黄昏的长传</button>
              {blocks.map((block) => (
                <button key={block.id} className={`outline-item ${active === block.id ? "active" : ""}`} onClick={() => setActive(block.id)}>
                  <span className="outline-num">{block.index}</span><span>{block.title}</span>
                </button>
              ))}
            </nav>
            <button className="add-block">＋ 添加内容块</button>
            <div className="word-count"><span>⌁</span><div><strong>2,416</strong><small>字 · 第一章</small></div></div>
          </aside>

          <section className="manuscript" aria-label="正文编辑区">
            <div className="paper-meta"><span>最后编辑于 刚刚</span><span>···</span></div>
            <div className="title-block"><p>校园恋爱视觉小说 · 初稿</p><h1 contentEditable suppressContentEditableWarning onInput={markEditing}>越过黄昏的<br />长传</h1><div className="title-rule"><span /></div></div>
            {blocks.map((block) => (
              <article key={block.id} className={`content-block ${active === block.id ? "selected" : ""}`} onClick={() => setActive(block.id)}>
                <div className="block-index">{block.index}</div>
                <div className="block-content">
                  <p className="eyebrow">{block.eyebrow}</p>
                  <h2 contentEditable suppressContentEditableWarning onInput={markEditing}>{block.title}</h2>
                  <p className="body-copy" contentEditable suppressContentEditableWarning onInput={markEditing}>{block.body}</p>
                  {block.image && <figure className="editorial-image"><img src="chapter-one-terrace.png" alt="夕阳中的现代美术馆露台上，蓝色长发、戴圆框眼镜的学姐穿长裙回望男主" /><figcaption>CG 01 · 夕阳露台上的回望</figcaption></figure>}
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
                {refsOpen[block.id] && <div className="ref-body"><a href={`https://${block.ref.url}`} target="_blank" rel="noreferrer">{block.ref.url} ↗</a><p contentEditable suppressContentEditableWarning onInput={markEditing}>{block.ref.note}</p><div className="ref-tags"><span># 人物</span><span># 第一章</span></div></div>}
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
            <div className="map-node root-node"><small>主题</small><h2>越过黄昏的长传</h2><p>足球少年与两种截然不同的心动</p><div className="node-actions"><span>2,416 字</span><button>＋</button></div></div>
            {blocks.map((block, idx) => <div key={block.id} className={`map-node branch-node node-${idx + 1}`} style={{ borderTopColor: branchColor }} onClick={() => setActive(block.id)}><small>{block.eyebrow}</small><h3>{block.title}</h3><p>{block.body.slice(0, 48)}…</p><span className="node-ref">↗ 1 条引用</span></div>)}
            <div className="map-node child-node" style={{ borderTopColor: overrideColor ?? branchColor }}><small>男主 · 核心矛盾</small><h3>选择自己的位置</h3><p>球场上习惯前锋位置的他，第一次无法判断该往哪里跑。</p><span className="node-ref">⊙ 颜色已覆盖</span></div>
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
