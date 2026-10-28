import { cp, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Bundle the viewer's own resources locally; PDFs never need a remote service.
const require = createRequire(import.meta.url);
const root = dirname(require.resolve('pdfjs-dist/package.json'));
await mkdir('public', { recursive: true });
await cp(join(root, 'build/pdf.worker.min.mjs'), 'public/pdf.worker.min.mjs');
for (const [source, target] of [['cmaps', 'pdf-cmaps'], ['standard_fonts', 'pdf-fonts'], ['wasm', 'pdf-wasm']]) {
  await cp(join(root, source), `public/${target}`, { recursive: true });
}
