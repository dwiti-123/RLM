import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { documentStore } from "../upload/route";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function POST(req) {
  try {
    const { docId, userQuestion } = await req.json();

    if (!docId || !userQuestion) {
      return NextResponse.json(
        { success: false, error: "docId and userQuestion are required" },
        { status: 400 }
      );
    }
const stored = documentStore.get(docId);
    if (!stored) {
      return NextResponse.json(
        { success: false, error: "Document not found. Please upload again." },
        { status: 404 }
      );
    }
    const document = stored.text;

    const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });

    // --- NAIVE BASELINE ---
    // This is intentionally the "wrong" approach for comparison purposes:
    // the ENTIRE document is pasted directly into the prompt/context in one
    // shot, with no chunking, no tool use, no recursion. This is what the
    // RLM approach in rlm-query/route.js is trying to improve on.
    const prompt = `Here is a document:\n\n${document}\n\nQuestion: ${userQuestion}`;

    const start = Date.now();
    const result = await model.generateContent(prompt);
    const durationMs = Date.now() - start;
    // --- END NAIVE BASELINE ---

    const usage = result.response.usageMetadata;

    return NextResponse.json({
      success: true,
      answer: result.response.text(),
      durationMs,
      usage: {
        promptTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        totalTokens: usage?.totalTokenCount ?? 0,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}