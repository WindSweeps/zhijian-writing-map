# 枝间 · Writing Map

一个服务于长篇写作的可视化思维地图 Demo。在同一份内容上切换线性写作与 Map 结构视图，同时管理正文、引用和旁注。

## 功能

- 左侧大纲、中间正文、右侧引用的线性写作界面
- 可视化母子关系的 Map 模式
- 分支颜色继承与子级独立覆盖
- 可编辑标题、正文、引用和旁注
- 引用卡片折叠与专注写作模式
- 从本地文件夹读取 `workspace.json` 与 Markdown，完整恢复工作区
- 将编辑后的结构、正文、引用、视图设置与图片写回同一文件夹

## 本地工作区格式

选择一个文件夹作为工作区。首次使用可在网页中点击“保存”并选择空文件夹，网页会生成：

```text
workspace.json
content/
  01-opening.md
  02-memory.md
assets/
  chapter-one-terrace.png
```

`workspace.json` 保存作品名称、内容块顺序、引用、图片路径、Map 颜色和视图设置；`content/*.md` 保存每个内容块的正文。再次点击“打开文件夹”即可完整重建工作区。

直接读写文件夹依赖浏览器 File System Access API，请使用最新版 Chrome 或 Edge，并通过 HTTPS 或 localhost 打开页面。所有读写都发生在本机，内容不会上传到服务器。

## 本地运行

```bash
npm install
npm run dev
```
