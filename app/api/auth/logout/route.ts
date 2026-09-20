import { createLogoutCookieHeader } from "@/lib/auth";

export async function POST() {
  const cookieHeader = createLogoutCookieHeader();
  return Response.json(
    { ok: true, message: "Berhasil keluar" },
    {
      status: 200,
      headers: {
        "Set-Cookie": cookieHeader,
        "Cache-Control": "no-store",
      },
    }
  );
}
