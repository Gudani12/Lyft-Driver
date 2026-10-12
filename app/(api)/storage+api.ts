import { getSupabaseServerClient } from "@/lib/supabase-server";
import { requireClerkUser } from "@/lib/server-auth";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_BUCKETS = new Set(["verification-documents", "avatars"]);

const isOwnedPath = (path: string, clerkId: string) => {
  const prefix = `${clerkId}/`;
  return (
    path.startsWith(prefix) &&
    !path.split("/").some((segment) => segment === "." || segment === "..")
  );
};

export async function POST(request: Request) {
  let clerkId: string;
  try {
    clerkId = await requireClerkUser(request);
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }

  let body: {
    bucket?: unknown;
    path?: unknown;
    base64?: unknown;
    contentType?: unknown;
    upsert?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "A valid JSON upload body is required." }, { status: 400 });
  }

  const { bucket, path, base64, contentType, upsert } = body;
  if (
    typeof bucket !== "string" ||
    !ALLOWED_BUCKETS.has(bucket) ||
    typeof path !== "string" ||
    !isOwnedPath(path, clerkId) ||
    typeof base64 !== "string" ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) ||
    base64.length > Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 4 ||
    typeof contentType !== "string" ||
    !["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"].includes(
      contentType.toLowerCase(),
    )
  ) {
    return Response.json({ error: "Invalid file upload." }, { status: 400 });
  }

  const file = Buffer.from(base64, "base64");
  if (file.byteLength === 0 || file.byteLength > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "File size must be between 1 byte and 10 MB." }, { status: 400 });
  }

  if (upsert === true && bucket !== "avatars") {
    return Response.json({ error: "Upsert is only allowed for avatar uploads." }, { status: 400 });
  }

  try {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      contentType,
      upsert: upsert === true,
    });
    if (error) throw error;

    const publicUrl =
      bucket === "avatars"
        ? supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
        : undefined;

    return Response.json({ data: { path, ...(publicUrl ? { publicUrl } : {}) } });
  } catch (error) {
    console.error("Render storage upload failed:", error);
    return Response.json({ error: "Unable to upload this file right now." }, { status: 502 });
  }
}

export async function GET(request: Request) {
  let clerkId: string;
  try {
    clerkId = await requireClerkUser(request);
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }

  const params = new URL(request.url).searchParams;
  const bucket = params.get("bucket");
  const path = params.get("path");
  const expiresInSeconds = Number(params.get("expiresInSeconds") ?? 60);
  if (
    bucket !== "verification-documents" ||
    !path ||
    !isOwnedPath(path, clerkId) ||
    !Number.isInteger(expiresInSeconds) ||
    expiresInSeconds < 1 ||
    expiresInSeconds > 3600
  ) {
    return Response.json({ error: "Invalid signed URL request." }, { status: 400 });
  }

  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);
    if (error) throw error;
    return Response.json({ data: { signedUrl: data.signedUrl } });
  } catch (error) {
    console.error("Render storage signed URL creation failed:", error);
    return Response.json({ error: "Unable to access this file right now." }, { status: 502 });
  }
}
