// Prepare an attached file for POST /api/extract.
// Photos are shrunk on the device (longest side <= 1600px, JPEG 0.85) to stay
// well under Vercel's 4.5 MB body limit. Nothing is stored.

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.85;

export interface UploadPayload {
  imageBase64: string; // raw base64, no "data:" prefix
  mimeType: string;
  name: string;
}

export type UploadErrorCode = "too_large" | "unsupported";

export class UploadError extends Error {
  code: UploadErrorCode;
  constructor(code: UploadErrorCode) {
    super(code);
    this.code = code;
    this.name = "UploadError";
  }
}

/** Blob → raw base64 (no data: prefix). */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

function guessMime(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "heic" || ext === "heif") return "image/heic";
  return "";
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() };
    } catch {
      /* fall through to <img> decoding (older Safari, odd formats) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

async function compressImage(file: Blob): Promise<Blob> {
  const { source, width, height, release } = await decode(file);
  try {
    if (!width || !height) throw new Error("empty image");
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", JPEG_QUALITY),
    );
  } finally {
    release();
  }
}

/**
 * File → payload for /api/extract.
 * - Images: decoded with EXIF orientation, resized, re-encoded as JPEG. If decoding
 *   fails (e.g. HEIC on some browsers) the original is sent when <= 4 MB.
 * - PDFs: sent as-is when <= 4 MB.
 * Throws UploadError("too_large" | "unsupported").
 */
export async function fileToPayload(file: File): Promise<UploadPayload> {
  const name = file.name || "report";
  const mimeType = file.type || guessMime(name);

  if (mimeType === "application/pdf") {
    if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("too_large");
    return { imageBase64: await blobToBase64(file), mimeType, name };
  }

  if (mimeType.startsWith("image/") || mimeType === "") {
    try {
      const jpeg = await compressImage(file);
      return { imageBase64: await blobToBase64(jpeg), mimeType: "image/jpeg", name };
    } catch {
      if (!mimeType) throw new UploadError("unsupported");
      if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("too_large");
      return { imageBase64: await blobToBase64(file), mimeType, name };
    }
  }

  throw new UploadError("unsupported");
}
