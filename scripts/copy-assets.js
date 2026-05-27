/**
 * copy-assets.js
 * Copia archivos .html y appsscript.json desde src/ a dist/
 * Se ejecuta después de la compilación TypeScript (tsc)
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');
const DIST_DIR = path.join(__dirname, '..', 'dist');

// Extensiones de archivos a copiar (los .ts ya los compila tsc)
const COPY_EXTENSIONS = ['.html', '.json'];

if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

const files = fs.readdirSync(SRC_DIR);
let copied = 0;

for (const file of files) {
  const ext = path.extname(file);
  if (COPY_EXTENSIONS.includes(ext)) {
    const src = path.join(SRC_DIR, file);
    const dest = path.join(DIST_DIR, file);
    fs.copyFileSync(src, dest);
    console.log(`  ✓ Copiado: ${file}`);
    copied++;
  }
}

console.log(`\n✅ ${copied} archivo(s) copiado(s) a dist/`);
