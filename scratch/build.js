/**
 * Jeopardy Single-File Compiler Script (build.js)
 * Compiles index.html, style.css, and all JS state modules into a single, fully self-contained offline HTML file.
 * Runs completely offline using native Node.js libraries (zero external dependencies).
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const rootDir = process.env.PWD || process.cwd();
const indexFile = path.join(rootDir, "index.html");
const distDir = path.join(rootDir, "dist");
const outputFile = path.join(distDir, "jeopardy_all_in_one.html");

console.log("--------------------------------------------------");
console.log("🚀 Starting Single-File Jeopardy Compiler Pipeline...");
console.log(`Source template: ${indexFile}`);
console.log("--------------------------------------------------");

function minifyCSS(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "") // Strip block comments
    .split("\n")
    .map((line) => line.trim()) // Trim spaces
    .filter((line) => line.length > 0)
    .join("") // Merge into single line
    .replace(/\s*([\{\}:;,])\s*/g, "$1") // Trim around symbols
    .replace(/\s+/g, " ") // Collapse remaining double spaces
    .trim();
}

function minifyJS(js) {
  return js
    .replace(/\/\*[\s\S]*?\*\//g, "") // 1. Strip block comments
    .replace(/(^|[^:])\/\/.*$/gm, "$1") // 2. Strip mid-line comments (protecting URLs)
    .split("\n")
    .map((line) => line.trim()) // 3. Trim indents and trailing spaces
    .filter((line) => line.length > 0) // 4. Purge empty lines completely
    .join("\n")
    .replace(/\s*([\(\)\=\+\-\*\/,\:;\?<>!])\s*/g, "$1") // 5. Strip spaces around operators/symbols (leaving { and } intact for template literals)
    .trim();
}

function minifyHTML(html) {
  return html
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, "") // Strip HTML comments
    .replace(/>\s+([^\s<])/g, ">$1") // Trim spaces after tags
    .replace(/([^\s>])\s+</g, "$1<") // Trim spaces before tags
    .trim();
}

try {
  // Ensure target output directory exists
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
    console.log(`Created output folder: ${distDir}`);
  }

  // Load the unified HTML template
  if (!fs.existsSync(indexFile)) {
    throw new Error(
      `Unified template index.html not found in root. Make sure you are in the workspace directory.`,
    );
  }
  let html = fs.readFileSync(indexFile, "utf8");

  // 1. Inline CSS stylesheets
  const cssRegex =
    /<link\s+rel="stylesheet"\s+href="src\/css\/style\.css"\s*\/?>/g;
  html = html.replace(cssRegex, () => {
    const cssPath = path.join(rootDir, "src", "css", "style.css");
    console.log(`➕ Inlining & minifying stylesheet: src/css/style.css`);
    if (!fs.existsSync(cssPath)) {
      throw new Error(`CSS file not found at ${cssPath}`);
    }
    const cssContent = fs.readFileSync(cssPath, "utf8");
    const minifiedCss = minifyCSS(cssContent);
    console.log(
      `   └─ Size reduced: ${cssContent.length} bytes -> ${minifiedCss.length} bytes (${Math.round((1 - minifiedCss.length / cssContent.length) * 100)}% saved)`,
    );
    return `<style>\n${minifiedCss}\n</style>`;
  });

  // 2. Inline Javascript files sequentially
  const scripts = [
    { name: "deck.js", src: "src/js/deck.js" },
    { name: "app.js", src: "src/js/app.js" },
    { name: "audio.js", src: "src/js/audio.js" },
    { name: "board-ui.js", src: "src/js/board-ui.js" },
    { name: "host-ui.js", src: "src/js/host-ui.js" },
  ];

  scripts.forEach((script) => {
    const scriptRegex = new RegExp(
      `<script\\s+src="src\\/js\\/${script.name}"\\s*><\\/script>`,
      "g",
    );
    const jsPath = path.join(rootDir, script.src);
    console.log(`➕ Inlining & minifying javascript: ${script.src}`);
    if (!fs.existsSync(jsPath)) {
      throw new Error(`JS file not found at ${jsPath}`);
    }
    const jsContent = fs.readFileSync(jsPath, "utf8");
    const minifiedJs = minifyJS(jsContent);
    console.log(
      `   └─ Size reduced: ${jsContent.length} bytes -> ${minifiedJs.length} bytes (${Math.round((1 - minifiedJs.length / jsContent.length) * 100)}% saved)`,
    );
    html = html.replace(scriptRegex, `<script>\n${minifiedJs}\n</script>`);
  });

  // 3. Minify inline router script and entire HTML structure
  console.log("➕ Minifying inline template scripts and HTML layout...");
  html = html.replace(/<script>([\s\S]*?)<\/script>/gi, (match, jsCode) => {
    return `<script>\n${minifyJS(jsCode)}\n</script>`;
  });
  const rawHtmlLen = html.length;
  html = minifyHTML(html);
  console.log(
    `   └─ HTML size reduced: ${rawHtmlLen} bytes -> ${html.length} bytes (${Math.round((1 - html.length / rawHtmlLen) * 100)}% saved)`,
  );

  // 4. Compress using Gzip and encode as Base64
  console.log("🗜️ Compressing unified package with Gzip...");
  const gzipBuffer = zlib.gzipSync(Buffer.from(html, "utf8"), { level: 9 });
  const compressedBase64 = gzipBuffer.toString("base64");

  // 5. Construct self-extracting bootstrap HTML
  const selfExtractingHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Jeopardy Single-File Offline</title>
</head>
<body style="background:#0c101b; color:#fff; font-family:system-ui,-apple-system,sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; overflow:hidden;">
  <div id="loader" style="text-align:center;">
    <h2 style="font-size:24px; font-weight:700; margin-bottom:8px; letter-spacing:-0.02em;">Loading Jeopardy...</h2>
    <p style="font-size:14px; color:rgba(255,255,255,0.4); margin:0 0 20px;">Decompressing native offline assets...</p>
    <div style="width:40px; height:40px; border:4px solid rgba(255,255,255,0.1); border-radius:50%; border-top-color:#3b82f6; animation:spin 1s infinite linear; margin:0 auto;"></div>
  </div>
  <style>@keyframes spin { 100% { transform:rotate(360deg); } }</style>
  <script>
    (async () => {
      const payload = "${compressedBase64}";
      try {
        const bytes = Uint8Array.from(atob(payload), c => c.charCodeAt(0));
        const ds = new DecompressionStream('gzip');
        const writer = ds.writable.getWriter();
        writer.write(bytes);
        writer.close();
        const decompressed = await new Response(ds.readable).text();
        const loader = document.getElementById('loader');
        if (loader) {
          loader.style.display = 'none';
          loader.remove();
        }
        document.open();
        document.write(decompressed);
        document.close();
      } catch (err) {
        document.getElementById('loader').innerHTML = '<h3 style="color:#ef4444;">Error Loading App</h3><p style="font-size:14px; color:rgba(255,255,255,0.6);">' + err.message + '</p>';
      }
    })();
  </script>
</body>
</html>`;

  // Write fully packaged self-contained compressed HTML
  fs.writeFileSync(outputFile, selfExtractingHtml, "utf8");
  console.log("--------------------------------------------------");
  console.log("🎉 SUCCESS! Standalone self-extracting application created!");
  console.log(
    `   └─ Size reduced: ${html.length} bytes -> ${selfExtractingHtml.length} bytes (${Math.round((1 - selfExtractingHtml.length / html.length) * 100)}% saved offline)`,
  );
  console.log(`Output: file://${outputFile}`);
  console.log("--------------------------------------------------");
} catch (error) {
  console.error("❌ Compilation failed:", error.message);
  process.exit(1);
}
