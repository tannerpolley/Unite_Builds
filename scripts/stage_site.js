const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const outputDir = path.join(repoRoot, "_site");
const requiredEntries = [
  "index.html",
  "static",
  "preview.png",
  "favicon.ico",
  "CNAME",
];
const optionalEntries = [
  "googlef8110ce2996a7ffd.html",
];

function copyEntry(relativePath) {
  const source = path.join(repoRoot, relativePath);
  const target = path.join(outputDir, relativePath);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
  console.log(`[stage] copied ${relativePath}`);
}

function main() {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  requiredEntries.forEach((relativePath) => {
    if (!fs.existsSync(path.join(repoRoot, relativePath))) {
      throw new Error(`Missing required publishable file: ${relativePath}`);
    }
    copyEntry(relativePath);
  });

  optionalEntries.forEach((relativePath) => {
    if (fs.existsSync(path.join(repoRoot, relativePath))) {
      copyEntry(relativePath);
    }
  });

  console.log(`[stage] site artifact ready at ${outputDir}`);
}

main();
