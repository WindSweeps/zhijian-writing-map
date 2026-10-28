# 枝间 · Writing Map

连接 Markdown 笔记与 PDF 参考资料的本地优先思维地图 Demo。文件保持独立，JSON 保存它们之间的关系。

[打开 Demo](https://windsweeps.github.io/zhijian-writing-map/)

公开网页从空白工程开始，只展示功能介绍，不附带个人草稿或示例作品。

## 功能

- 三栏工作区：文件列表、关系图、阅读／编辑；小屏切换面板
- Markdown 源码编辑与预览：标题、表格、列表、本地图片和文件链接
- PDF 内嵌阅读、翻页及指定页引用；保留 PDF 原始字节
- 节点拖动、键盘移动、父子层级、分支颜色继承及下级覆盖
- 显式关联、关系名称、双向引用列表和文档旁注
- Map／线性阅读切换；自动整理布局和调整图间距
- 直接打开／保存本地工程文件夹，或导入／导出便携工程 ZIP
- 缺失文件提示、非法工程校验、未保存修改提醒；不自动覆盖缺失正文

## 开始使用

1. 点击“新建笔记”或“导入”选择 `.md`、`.pdf`，也可打开已有文件夹或 ZIP。
2. 点击文件或节点，在右侧编辑 Markdown、阅读 PDF。
3. 在“关联”中选择父节点、颜色及目标文件；PDF 关联可以指定页码。
4. 点击“保存”写入本地文件夹；“导出工程”下载包含完整工程文件的 ZIP。

没有 `workspace.json` 的文件夹会自动发现 Markdown／PDF，并从 Markdown 相对链接建立初始关联。存在清单时以清单中的节点与关系为准。

Markdown 中可直接写文件链接，例如 `[资料第 3 页](../sources/reference.pdf#page=3)`；图片使用 `![图](../assets/image.png)`。链接路径相对当前 Markdown 文件，`/assets/image.png` 相对工程根目录。

## 本地工作区格式

工程使用 `workspace.json` v2，目录可自行组织：

```text
workspace.json
content/
  note.md
sources/
  reference.pdf
assets/
  reference-image.png
```

`workspace.json` 保存工程名称、节点 ID／标题／文件路径／坐标／父节点／颜色／阅读页码／旁注、引用关系、独立资源清单和视图设置。Markdown 正文、PDF 和图片保持为普通文件。再次打开文件夹或 ZIP 即可恢复。

保存不删除目录中的其他文件；移除节点也保留原文件。ZIP 包含工程管理的文档及资源，不打包所选目录中无关的其他文件。旧版 v1 工程可读取，保存时升级为 v2；旧引用、摘录和配图路径保留在节点旁注中。

缺少节点文件或清单中的资源时，保存／导出会停止并说明缺失项。补回文件后重新打开工程即可。保存完成后才显示已保存；文件系统中途写入失败会报告错误，不能保证多个文件同时回滚。

Chrome／Edge 可通过 HTTPS 或 localhost 直接读写用户选择的文件夹。不支持目录写入的浏览器使用文件夹导入和 ZIP 导出。授权来自浏览器的文件选择器。

工程在浏览器内处理，不上传到 GitHub；页面刷新不会自动恢复未保存工程。PDF worker、字体及解码资源随网站本地托管。Markdown 中主动引用的 HTTP 图片会请求该图片地址，点击外链会打开外部网站。

## 本地运行

```bash
npm install
npm run dev
```

使用 Node.js 22.18+。生产静态文件输出到 `out/`：

```bash
npm test
npm run build
```

GitHub Actions 在 `main` 更新后运行存储测试、构建并部署 GitHub Pages。构建会复制 PDF.js worker、字体、CMap 和 WASM 到静态资源目录；这些生成文件不提交到仓库。

浏览器回归测试使用合成 Markdown、两页 PDF 和图片，不读取个人文件：

```bash
npm install --no-save playwright
npx playwright install chromium
GITHUB_ACTIONS=true npm run build
SMOKE_ARTIFACT_DIR=/tmp npm run test:browser
```

测试覆盖导入、编辑、PDF 页码跳转、关系与颜色、拖动、导出后重开、错误状态，以及宽屏／窄屏／200% 文字。可用 `PLAYWRIGHT_CHANNEL=chrome` 指定本机 Chrome。
