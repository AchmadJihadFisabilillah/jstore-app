import { operatorFromRequest } from "@/lib/operator";

export async function GET(request: Request) {
  try {
    const operator = await operatorFromRequest(request);
    if (!operator) {
      return Response.json({ user: null }, { status: 401 });
    }
    return Response.json({ user: operator }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ user: null }, { status: 503 });
  }
}
