import { storage } from "../../../../lib/server";
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key }=await params;
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(key)) return new Response("Not found",{status:404});
  const file=await storage().bucket.get(key); if (!file) return new Response("Not found",{status:404});
  return new Response(file.body,{headers:{"Content-Type":file.httpMetadata?.contentType??"image/jpeg","Cache-Control":"public, max-age=86400","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'"}});
}
