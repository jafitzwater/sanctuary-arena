// Runs every doc-item test in test/items/ (one file per gap-list item, batch 2).
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'items');
for (const file of readdirSync(dir).filter((name) => name.endsWith('.ts')).sort()) {
  await import(pathToFileURL(join(dir, file)).href);
  console.log(`${file} ok`);
}
