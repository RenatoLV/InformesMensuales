const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
execFileSync(process.execPath, [path.join(root, 'node_modules/tailwindcss/lib/cli.js'), '-c', 'tools/tailwind.config.cjs', '-i', 'tools/tailwind.css', '-o', 'tools/tailwind.generated.css', '--minify'], {cwd:root, stdio:'inherit'});
fs.writeFileSync(path.join(root, 'CSS_TAILWIND.html'), '<style>' + fs.readFileSync(path.join(__dirname, 'tailwind.generated.css'), 'utf8') + '</style>');
