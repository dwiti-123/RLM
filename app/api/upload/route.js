import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { setDocument } from "../../lib/store";

// ---------- record splitting + scoring ----------

function splitByLabel(doc) {
  const labels = [...doc.matchAll(/\b(?:[A-Z][a-z]+ \d+):/g)];
  if (labels.length < 2) return [];
  return labels.map((m, i) =>
    doc.slice(m.index, (labels[i + 1]?.index) ?? doc.length).trim()
  );
}

function splitByLine(doc) {
  const lines = doc.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return lines.length >= 2 ? lines : [];
}

function splitBySentence(doc) {
  const s = doc.split(/(?<=\.)\s+/).filter(Boolean);
  return s.length >= 2 ? s : [];
}

function splitByBlock(doc) {
  const b = doc.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  return b.length >= 2 ? b : [];
}

function score(records, docLen) {
  if (records.length < 2) return 0;
  const lens = records.map((r) => r.length);
  const mean = lens.reduce((a, b) => a + b, 0) / records.length;
  const variance = lens.reduce((a, l) => a + (l - mean) ** 2, 0) / records.length;
  const evenness = 1 / (1 + variance / (mean * mean));
  const coverage = lens.reduce((a, l) => a + l, 0) / docLen;
  const countBonus = Math.min(records.length / 50, 1);
  return evenness * coverage + countBonus;
}

function enrichLabels(strategy, records) {
  if (strategy !== "label") return records;
  return records.map((r) => {
    const m = r.text.match(/\b(?:[A-Z][a-z]+ \d+):/);
    return { label: m ? m[0].replace(/:$/, "").trim() : "", text: r.text };
  });
}

export function buildRecordIndex(document) {
  const splitters = [
    ["label", splitByLabel],
    ["line", splitByLine],
    ["block", splitByBlock],
    ["sentence", splitBySentence],
  ];

  let best = null;
  for (const [name, fn] of splitters) {
    const texts = fn(document);
    const s = score(texts, document.length);
    if (s > 0 && (!best || s > best.score)) {
      best = { strategy: name, score: s, records: texts.map((t) => ({ label: "", text: t })) };
    }
  }

  if (!best) {
    return { strategy: "whole", score: 0, records: [{ label: "", text: document.trim() }] };
  }
  return { ...best, records: enrichLabels(best.strategy, best.records) };
}

// ---------- upload route ----------

export async function POST(req) {
  try {
    const { document } = await req.json();
    if (!document) {
      return NextResponse.json({ success: false, error: "document is required" }, { status: 400 });
    }
    const docId = randomUUID();
    const index = buildRecordIndex(document);
    await setDocument(docId, document, index);
    return NextResponse.json({ success: true, docId, length: document.length, strategy: index.strategy });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}