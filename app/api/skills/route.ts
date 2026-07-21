import { withSecureRoute } from "@/lib/crypto/server";
import { NextResponse } from "next/server";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { basename } from "path";
import { DefaultResourceLoader, getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { requireAdmin } from "@/lib/admin-auth";
import {
  getChatRoot,
  getWorkspaceRoots,
  isPathInsideAnyRoot,
  normalizeAbsolutePath,
  validateKnownCwd,
} from "@/lib/server-config";

export const dynamic = "force-dynamic";

// GET /api/skills?cwd=<path>
// Uses DefaultResourceLoader (same logic as AgentSession startup) so settings.json
// skill paths, package skills, and .agents/skills directories are all included.
async function GET__secureImpl(req: Request) {
  const { searchParams } = new URL(req.url);
  const cwdResult = validateKnownCwd(searchParams.get("cwd"));
  if (!cwdResult.ok) return NextResponse.json({ error: cwdResult.error }, { status: cwdResult.status });

  try {
    const loader = new DefaultResourceLoader({ cwd: cwdResult.cwd, agentDir: getAgentDir() });
    await loader.reload();
    const { skills, diagnostics } = loader.getSkills();
    return NextResponse.json({ skills, diagnostics });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PATCH /api/skills — toggle disable-model-invocation on a SKILL.md file
async function PATCH__secureImpl(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json() as { filePath: string; disableModelInvocation: boolean };
    const { filePath, disableModelInvocation } = body;
    if (!filePath) return NextResponse.json({ error: "filePath required" }, { status: 400 });
    const normalizedFilePath = normalizeAbsolutePath(filePath);
    if (basename(normalizedFilePath).toLowerCase() !== "skill.md") {
      return NextResponse.json({ error: "filePath must point to a SKILL.md file" }, { status: 400 });
    }
    if (!isPathInsideAnyRoot(normalizedFilePath, [getAgentDir(), getChatRoot(), ...getWorkspaceRoots()])) {
      return NextResponse.json({ error: "filePath is outside configured agent/chat/workspace roots" }, { status: 403 });
    }
    if (!existsSync(normalizedFilePath)) return NextResponse.json({ error: "file not found" }, { status: 404 });

    const content = readFileSync(normalizedFilePath, "utf8");
    const key = "disable-model-invocation";

    // Use parseFrontmatter to check current value, then do a surgical line edit
    // to preserve the original YAML formatting of all other fields.
    const { frontmatter } = parseFrontmatter<Record<string, unknown>>(content);
    const alreadySet = Boolean(frontmatter[key]);

    let updated = content;
    if (disableModelInvocation && !alreadySet) {
      // Add key after the opening --- line
      updated = content.replace(/^---\r?\n/, `---\n${key}: true\n`);
      // If no frontmatter exists, create one
      if (updated === content) updated = `---\n${key}: true\n---\n${content}`;
    } else if (!disableModelInvocation && alreadySet) {
      // Remove the key line entirely
      updated = content.replace(new RegExp(`^${key}\\s*:.*\\r?\\n`, "m"), "");
    }

    writeFileSync(normalizedFilePath, updated, "utf8");
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export const GET = withSecureRoute(GET__secureImpl);
export const PATCH = withSecureRoute(PATCH__secureImpl);
