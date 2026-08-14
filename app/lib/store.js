import { createClient } from "@vercel/kv";

export const DOC_TTL_SECONDS = 60 * 60 * 24;

const kv = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
  ? createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    })
  : null;

const memory = new Map();

export async function setDocument(docId, text, index) {
  const payload = JSON.stringify({ text, index });
  if (kv) {
    await kv.set(`doc:${docId}`, payload, { ex: DOC_TTL_SECONDS });
  }
  memory.set(docId, { text, index });
}

export async function getDocument(docId) {
  if (kv) {
    const raw = await kv.get(`doc:${docId}`);
    if (raw != null) {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    }
    return null;
  }
  return memory.get(docId) ?? null;
}
