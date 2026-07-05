import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const MIME = {
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function collectAssets(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectAssets(full));
    } else if (MIME[extname(entry).toLowerCase()]) {
      results.push(full.replace(/\\/g, '/'));
    }
  }
  return results;
}

console.log('Bundling JS…');
let js = execSync('npx --yes esbuild src/main.js --bundle --format=iife', {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});

console.log('Inlining assets…');
for (const rel of collectAssets('assets')) {
  if (!js.includes(rel)) continue;
  const mime = MIME[extname(rel).toLowerCase()];
  const b64 = readFileSync(rel).toString('base64');
  js = js.replaceAll(rel, `data:${mime};base64,${b64}`);
  console.log(`  inlined ${rel}`);
}

js = js.replaceAll('</script', '<\\/script');

console.log('Assembling HTML…');
let html = readFileSync('index.html', 'utf8');

html = html.replace(
  /<link rel="stylesheet" href="([^"]+)">/g,
  (_, href) => `<style>\n${readFileSync(href, 'utf8')}\n</style>`,
);

html = html.replace(
  /<script type="module" src="[^"]+"><\/script>/,
  `<script>\n${js}\n</script>`,
);

mkdirSync('dist', { recursive: true });
writeFileSync('dist/some-hero.html', html);

const kb = Math.round(readFileSync('dist/some-hero.html').length / 1024);
console.log(`dist/some-hero.html — ${kb} KB`);
