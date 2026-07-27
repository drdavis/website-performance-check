// tools/make-icons.mjs
// Regenerates the extension icons (16/32/48/128) from the D3-branded master
// at icons/Source.png using macOS `sips`. Run: npm run icons
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const SOURCE = "icons/Source.png";
const SIZES = [16, 32, 48, 128];

if (!existsSync(SOURCE)) {
  console.error(`Missing ${SOURCE}. Drop the master logo there and re-run.`);
  process.exit(1);
}

for (const size of SIZES) {
  execFileSync("sips", ["-s", "format", "png", "-z", String(size), String(size), SOURCE, "--out", `icons/icon-${size}.png`], {
    stdio: "ignore"
  });
}
console.log(`icons written from ${SOURCE}: ${SIZES.join(", ")}`);
