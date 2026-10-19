export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { googleClientId: process.env.GOOGLE_CLIENT_ID ?? null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
