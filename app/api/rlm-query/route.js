import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { documentStore } from "../upload/route";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const tools = [
  {
    functionDeclarations: [
      {
        name: "probe",
        description:
          "Read a small sample (~250 chars) of the raw document to learn its " +
          "structure/format. Call once or twice, then use query() for exact answers.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            offset: {
              type: SchemaType.NUMBER,
              description: "Approximate character offset to sample (default 0)",
            },
          },
          required: ["offset"],
        },
      },
      {
        name: "query",
        description:
          "Scan ALL records deterministically (no LLM reads the text). A record " +
          "matches if it contains every phrase in `match` (case-insensitive) AND " +
          "satisfies every regex in `regex`. Returns exact count + sample labels.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            match: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
              description:
                "Phrases every matching record must contain, e.g. ['dept: engineering']",
            },
            regex: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
              description:
                "Optional regexes, e.g. ['rating: (4\\.[6-9]|5\\.0)']",
            },
            limit: {
              type: SchemaType.NUMBER,
              description: "Max sample labels to return (default 20)",
            },
          },
          required: ["match"],
        },
      },
    ],
  },
];

async function callWithRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      const match = err.message?.match(/"retryDelay":"([\d.]+)s"/);
      const is429 = err.message?.includes("429");
      if (is429 && i < maxRetries - 1) {
        const waitSeconds = match ? parseFloat(match[1]) : 10;
        const waitMs = (waitSeconds + 1) * 1000;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }
}

function executeQuery(index, args) {
  const match = args.match || [];
  const regex = args.regex || [];
  const limit = args.limit || 20;
  const hits = index.records.filter((r) => {
    const t = r.text.toLowerCase();
    if (!match.every((p) => t.includes(String(p).toLowerCase()))) return false;
    return regex.every((p) => new RegExp(p, "i").test(r.text));
  });
  return {
    count: hits.length,
    strategy: index.strategy,
    samples: hits.slice(0, limit).map((r) => r.label || r.text.slice(0, 80)),
  };
}

function doProbe(document, offset) {
  const start = Math.max(0, Math.floor(offset || 0));
  return document.slice(start, start + 250);
}

export async function POST(req) {
  try {
    const { docId, userQuestion } = await req.json();

    if (!docId || !userQuestion) {
      return NextResponse.json(
        { success: false, error: "docId and userQuestion are required" },
        { status: 400 },
      );
    }

    const stored = documentStore.get(docId);
    if (!stored) {
      return NextResponse.json(
        { success: false, error: "Document not found. Please upload again." },
        { status: 404 },
      );
    }
    const document = stored.text;
    const documentIndex = stored.index;

    const model = genAI.getGenerativeModel({
      model: "gemini-flash-lite-latest",
      tools,
    });

    const systemPrompt = `You are answering a question about a long document.
You NEVER see the document text. You only know:
- Total length: ${document.length} characters
- The backend split it into records using the "${documentIndex.strategy}" strategy.

Tools:
1. "probe(offset)" — read a ~250 char sample to learn the format. Call once or twice.
2. "query(match[], regex[], limit)" — scans EVERY record; returns exact count + sample
   labels. The count is ground truth, not an estimate.

Rules:
- Use query() for counting/filtering. Phrase match phrases from the format you saw in probe.
- For numeric conditions (e.g. rating > 4.5) put a regex in the regex field.
- State numbers exactly as query() returned them. Never estimate or re-derive them.

Question to answer: ${userQuestion}`;

    const trace = [];
    let history = [{ role: "user", parts: [{ text: systemPrompt }] }];
    let usage = { promptTokens: 0, outputTokens: 0, totalTokens: 0 };

    const MAX_TURNS = 15;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const result = await callWithRetry(() =>
        model.generateContent({ contents: history }),
      );
      const response = result.response;
      const call = response.functionCalls()?.[0];

      const u = response.usageMetadata;
      if (u) {
        usage.promptTokens += u.promptTokenCount ?? 0;
        usage.outputTokens += u.candidatesTokenCount ?? 0;
        usage.totalTokens += u.totalTokenCount ?? 0;
      }

      if (!call) {
        const answerText = response.text();
        trace.push({ type: "final_answer", text: answerText });
        return NextResponse.json({ success: true, answer: answerText, trace, usage });
      }

      let toolResult;
      if (call.name === "probe") {
        toolResult = doProbe(document, call.args.offset);
      } else if (call.name === "query") {
        toolResult = JSON.stringify(executeQuery(documentIndex, call.args));
      } else {
        toolResult = "Unknown tool";
      }
      trace.push({
        type: "tool_call",
        name: call.name,
        args: call.args,
        result: toolResult,
      });

      history.push(response.candidates[0].content);
      history.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: call.name,
              response: { result: toolResult },
            },
          },
        ],
      });
    }

    return NextResponse.json({
      success: true,
      answer: "Max turns reached without final answer.",
      trace,
      usage,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
