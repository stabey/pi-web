// Shared attachment limits and text/code file detection for chat uploads.
//
// Chat supports two kinds of attachments:
//   - images  (png/jpeg/webp) -> sent to the model as image blocks
//   - files   (text/code)     -> extracted to text and injected into the prompt
//
// The pi agent only accepts text and image content, so non-image files must be
// UTF-8 decodable text. Binary formats are rejected up front.

export const MAX_ATTACHMENTS = 10; // images + files combined, per message
export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB per file
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB per image (matches asset store default)

export const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

// MIME types we accept for text/code uploads even when the extension is unknown.
const TEXT_MIME_ALLOWLIST = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-javascript",
  "application/typescript",
  "application/x-typescript",
  "application/x-yaml",
  "application/yaml",
  "application/toml",
  "application/x-sh",
  "application/x-httpd-php",
  "application/sql",
  "application/graphql",
  "application/x-ndjson",
  "image/svg+xml", // text-based
]);

// Extensions treated as text/code regardless of the browser-reported MIME type
// (browsers frequently report "" or "application/octet-stream" for code files).
const TEXT_EXTENSIONS = new Set([
  "txt", "text", "md", "markdown", "mdx", "rst", "adoc", "org",
  "csv", "tsv", "json", "json5", "jsonl", "ndjson", "geojson",
  "xml", "yaml", "yml", "toml", "ini", "cfg", "conf", "config", "properties", "env",
  "html", "htm", "xhtml", "css", "scss", "sass", "less", "svg",
  "js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts",
  "py", "pyi", "rb", "php", "java", "kt", "kts", "scala", "groovy",
  "go", "rs", "c", "h", "cc", "cpp", "cxx", "hpp", "hh", "hxx", "m", "mm",
  "cs", "fs", "fsx", "vb", "swift", "dart", "lua", "pl", "pm", "r",
  "sh", "bash", "zsh", "fish", "ps1", "psm1", "bat", "cmd",
  "sql", "graphql", "gql", "proto", "thrift", "avdl",
  "dockerfile", "makefile", "mk", "cmake", "gradle", "sbt", "bazel", "bzl",
  "vue", "svelte", "astro", "hbs", "ejs", "pug", "twig", "liquid",
  "tex", "bib", "diff", "patch", "log", "gitignore", "gitattributes",
  "editorconfig", "npmrc", "nvmrc", "prettierrc", "eslintrc", "babelrc",
]);

// Files with no extension but a well-known text name (e.g. Dockerfile, Makefile).
const TEXT_BASENAMES = new Set([
  "dockerfile", "makefile", "readme", "license", "licence", "changelog",
  "authors", "contributors", "notice", "copying", "gemfile", "rakefile",
  "procfile", "brewfile", "podfile", "vagrantfile", "jenkinsfile",
]);

export function fileExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function fileBasename(name: string): string {
  return (name.split(/[\\/]/).pop() ?? name).toLowerCase();
}

/** True when a file should be treated as an image attachment. */
export function isImageMime(mimeType: string | undefined | null): boolean {
  return !!mimeType && IMAGE_MIME_TYPES.has(mimeType);
}

/**
 * True when a file is an acceptable text/code upload. Decided by extension
 * first (most reliable), then by MIME type, then by a small basename allowlist.
 */
export function isTextFile(name: string, mimeType?: string | null): boolean {
  const ext = fileExtension(name);
  if (ext && TEXT_EXTENSIONS.has(ext)) return true;
  if (mimeType) {
    if (mimeType.startsWith("text/")) return true;
    if (TEXT_MIME_ALLOWLIST.has(mimeType)) return true;
  }
  if (!ext && TEXT_BASENAMES.has(fileBasename(name))) return true;
  return false;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
