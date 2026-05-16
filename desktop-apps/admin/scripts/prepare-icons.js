const fs = require('fs');
const path = require('path');
let pngToIco = null;
try {
  pngToIco = require('png-to-ico');
} catch (err) {
  // png-to-ico is optional in some environments; fall back to copying PNG only.
  console.warn('[prepare-icons] png-to-ico not installed, ICO generation will be skipped');
}

const projectRoot = __dirname.replace(/\\scripts$/, '');
const frontendAssets = path.join(projectRoot, '..', '..', 'citi-nati-frontend', 'dist', 'assets');
const destDir = path.join(projectRoot, 'public');

async function prepare() {
  if (!fs.existsSync(frontendAssets)) {
    console.warn('[prepare-icons] Frontend assets folder not found:', frontendAssets);
    return;
  }

  const files = fs.readdirSync(frontendAssets);
  const logoFile = files.find((f) => /^citi-nati-logo.*\.png$/i.test(f));
  if (!logoFile) {
    console.warn('[prepare-icons] No citi-nati logo PNG found in frontend dist assets');
    return;
  }

  const src = path.join(frontendAssets, logoFile);
  const destPng = path.join(destDir, 'icon.png');
  const destIco = path.join(destDir, 'icon.ico');

  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  fs.copyFileSync(src, destPng);
  console.log('[prepare-icons] Copied', src, '->', destPng);

  if (pngToIco) {
    try {
      const buf = await pngToIco(destPng);
      fs.writeFileSync(destIco, buf);
      console.log('[prepare-icons] Created ICO at', destIco);
    } catch (err) {
      console.error('[prepare-icons] Failed to create ICO:', err);
    }
  } else {
    console.warn('[prepare-icons] Skipping ICO generation — no png-to-ico available');
  }
}

prepare();
