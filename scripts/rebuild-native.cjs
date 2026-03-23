'use strict';
// 1. Installs server/node_modules (if not present or outdated)
// 2. Recompiles native addons (better-sqlite3, sharp) against
//    Electron's bundled Node.js so they load correctly in the packaged app.

const { execSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

const root      = path.join(__dirname, '..');
const serverDir = path.join(root, 'server');

// ── Step 1: install server dependencies ──────────────────────────────
// --ignore-scripts skips native compilation (prebuild-install / node-gyp).
// electron-rebuild (step 2) will download the correct Electron prebuilts instead.
console.log('\n📦  Installing server dependencies…\n');
execSync('npm install --omit=dev --ignore-scripts', { stdio: 'inherit', cwd: serverDir });

// ── Step 2: rebuild native modules for Electron ──────────────────────
const electronPkg = JSON.parse(
  fs.readFileSync(path.join(root, 'node_modules', 'electron', 'package.json'), 'utf8')
);
const version = electronPkg.version;

console.log(`\n🔧  Rebuilding native modules for Electron ${version}…\n`);
execSync(
  `npx @electron/rebuild --version ${version} --module-dir "${serverDir}" --types prod,optional`,
  { stdio: 'inherit', cwd: root }
);

console.log('\n✅  Server ready for packaging.\n');
