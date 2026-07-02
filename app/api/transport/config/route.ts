import { NextResponse } from "next/server";
import {
  normalizeTransportConfig,
  readTransportConfig,
  writeTransportConfig,
} from "@/lib/transport-config";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ transport: readTransportConfig() });
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const transport = normalizeTransportConfig(body);
    writeTransportConfig(transport);
    return NextResponse.json({ transport });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
