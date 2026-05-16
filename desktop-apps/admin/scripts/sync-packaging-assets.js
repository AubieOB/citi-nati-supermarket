const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const sharedRoot = path.resolve(projectRoot, '..', '..');

const outputDirs = [
  path.join(projectRoot, 'dist-electron'),
  path.join(projectRoot, 'win-unpacked')
];

const copies = [
  {
    from: path.join(sharedRoot, 'electron'),
    to: path.join(projectRoot, 'electron')
  },
  {
    from: path.join(sharedRoot, 'citi-nati-frontend', 'dist'),
    to: path.join(projectRoot, 'citi-nati-frontend', 'dist')
  }
];

function removeDirectory(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  fs.rmSync(targetPath, { recursive: true, force: true });
  console.log('[sync-packaging-assets] Removed stale output:', targetPath);
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Source path not found: ${src}`);
  }

  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else if (stats.isFile()) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

for (const outputDir of outputDirs) {
  removeDirectory(outputDir);
}

for (const copy of copies) {
  console.log('[sync-packaging-assets] Copying', copy.from, '->', copy.to);
  removeDirectory(copy.to);
  copyRecursive(copy.from, copy.to);
}

console.log('[sync-packaging-assets] Packaging assets synchronized successfully.');
