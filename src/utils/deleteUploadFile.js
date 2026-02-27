// src/utils/deleteUploadFile.js
import fs from "fs/promises";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

/**
 * Safely delete an uploaded file by "key" (filename).
 * - blocks path traversal
 * - ignores missing files
 */
export async function deleteUploadFileByKey(key) {
  try {
    if (!key) return;

    const safe = path.basename(String(key));
    if (!safe || safe === "." || safe === "..") return;

    const full = path.join(UPLOAD_DIR, safe);
    await fs.unlink(full);
  } catch {
    // ignore: file missing or cannot be deleted
  }
}