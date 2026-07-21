import { withSecureRoute } from "@/lib/crypto/server";
// This route is no longer used — new sessions are created fully client-side.
// Kept as a no-op for reference.
async function POST__secureImpl() {
  return new Response("Not used", { status: 410 });
}

export const POST = withSecureRoute(POST__secureImpl);
