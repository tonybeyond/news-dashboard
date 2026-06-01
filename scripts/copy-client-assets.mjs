// Copies the compiled client bundle (dist/client/**) into public/, preserving
// subdirectory structure so that ESM imports like "../shared/types.js"
// resolve correctly when the Fastify static plugin serves them.

import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { cp, rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const src = join(root, "dist", "client");
const dst = join(root, "public");

if (!existsSync(src)) {
  console.error(`dist/client does not exist; run \`npm run build:client\` first.`);
  process.exit(1);
}

// Remove only the bits we own, leaving index.html, styles.css, and any
// non-generated files in public/ untouched.
await rm(join(dst, "app.js"), { force: true });
await rm(join(dst, "shared"), { recursive: true, force: true });
await rm(join(dst, "client"), { recursive: true, force: true });
await mkdir(dst, { recursive: true });
await cp(src, dst, { recursive: true });
console.log(`copied ${src} → ${dst}`);
