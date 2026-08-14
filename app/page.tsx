"use client";

import { useState, FormEvent, useRef } from "react";

interface TraceStep {
  type: "tool_call" | "final_answer";
  name?: string;
  args?: Record<string, any>;
  result?: string;
  text?: string;
}

interface RlmResult {
  success: boolean;
  answer: string;
  trace: TraceStep[];
  usage?: Usage;
}

interface NaiveResult {
  success: boolean;
  answer: string;
  durationMs: number;
  usage?: Usage;
}

interface Usage {
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface DocInfo {
  length: number;
  name: string;
}

function badgeClass(step: TraceStep) {
  if (step.type === "final_answer") return "final";
  if (step.name === "probe") return "peek";
  return "query";
}

function typeLabel(step: TraceStep) {
  if (step.type === "final_answer") return "final answer";
  return step.name === "probe" ? "probe" : "query";
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [docInfo, setDocInfo] = useState<DocInfo | null>(null);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<RlmResult | null>(null);
  const [naiveResult, setNaiveResult] = useState<NaiveResult | null>(null);
  const [naiveLoading, setNaiveLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    setError("");
    if (!file) {
      setError("Choose a .txt file first.");
      return;
    }
    setUploading(true);
    try {
      const text = await file.text();
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: text }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error);
      } else {
        setDocId(data.docId);
        setDocInfo({ length: data.length, name: file.name });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleAsk = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setResult(null);
    setNaiveResult(null);

    if (!docId || !question.trim()) {
      setError("Upload a document and enter a question first.");
      return;
    }

    setLoading(true);
    setNaiveLoading(true);
    try {
      const [rlm, naive] = await Promise.all([
        fetch("/api/rlm-query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ docId, userQuestion: question }),
        }),
        fetch("/api/naive-query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ docId, userQuestion: question }),
        }),
      ]);
      const rlmData = await rlm.json();
      const naiveData = await naive.json();
      if (!rlmData.success) {
        setError(rlmData.error);
      } else {
        setResult(rlmData);
      }
      if (!naiveData.success) {
        setError(naiveData.error);
      } else {
        setNaiveResult(naiveData);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setNaiveLoading(false);
    }
  };

  const reset = () => {
    setDocId(null);
    setDocInfo(null);
    setResult(null);
    setNaiveResult(null);
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <main className="rlm-main">
      <div className="rlm-container">
        <div className="rlm-eyebrow">
          <span className="rlm-dot" />
          Recursive Language Model — Demo
        </div>
        <h1 className="rlm-title">Ask a question. Watch it recurse.</h1>
        <p className="rlm-subtitle">
          The document is stored server-side and never enters the model&apos;s prompt.
          The model only knows its length, and uses <code>probe</code> to learn the
          format and <code>query</code> to get exact, backend-computed answers.
        </p>

        {!docId ? (
          <div className="rlm-dropzone">
            <div className="rlm-dropzoneLeft">
              <div className="rlm-fileIcon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                  <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <p className="rlm-dropzoneLabel">{file ? file.name : "Upload a document"}</p>
                <p className="rlm-dropzoneHint">.txt files only, any length</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt"
                className="rlm-fileInput"
                id="file-upload"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <label htmlFor="file-upload" className="rlm-chooseBtn">
                Choose file
              </label>
              <button className="rlm-primaryBtn" onClick={handleUpload} disabled={uploading || !file}>
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>
        ) : (
          <div className="rlm-loadedBar">
            <div className="rlm-loadedText">
              <span>✅</span>
              <span className="rlm-fname">{docInfo?.name}</span>
              <span className="rlm-meta">{docInfo?.length.toLocaleString()} chars</span>
            </div>
            <button className="rlm-linkBtn" onClick={reset}>
              Upload a different document
            </button>
          </div>
        )}

        {docId && (
          <form onSubmit={handleAsk} className="rlm-searchBar">
            <textarea
              className="rlm-searchTextarea"
              placeholder="Ask a question about the document…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={2}
            />
            <button type="submit" className="rlm-askBtn" disabled={loading}>
              {loading ? "Thinking…" : "Ask"}
            </button>
          </form>
        )}

        {error && <div className="rlm-error">{error}</div>}

        {result && (
          <>
            <div className="rlm-section">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <p className="rlm-sectionLabel" style={{ margin: 0 }}>
                  Side-by-side comparison
                </p>
                {naiveLoading && <p className="rlm-naiveRunning">running naive baseline…</p>}
              </div>

              <div className="rlm-compare">
                  <div className="rlm-compareCol">
                    <p className="rlm-compareLabel">
                      RLM (probe + deterministic query)
                    </p>
                    <div className="rlm-answerCard">{result.answer}</div>
                    {result.usage && (
                      <p className="rlm-tokens">
                        {result.usage.promptTokens.toLocaleString()} prompt ·{" "}
                        {result.usage.outputTokens.toLocaleString()} output ={" "}
                        <strong>{result.usage.totalTokens.toLocaleString()}</strong> total tokens
                      </p>
                    )}
                  </div>

                  <div className="rlm-compareCol">
                    <p className="rlm-compareLabel">
                      Naive baseline{naiveResult ? ` · ${naiveResult.durationMs}ms` : ""}
                    </p>
                    {naiveResult ? (
                      <>
                        <div className="rlm-answerCard" style={{ borderLeftColor: "var(--oxblood)" }}>
                          {naiveResult.answer}
                        </div>
                        {naiveResult.usage && (
                          <p className="rlm-tokens">
                            {naiveResult.usage.promptTokens.toLocaleString()} prompt ·{" "}
                            {naiveResult.usage.outputTokens.toLocaleString()} output ={" "}
                            <strong>{naiveResult.usage.totalTokens.toLocaleString()}</strong> total tokens
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="rlm-answerCard rlm-empty">
                        Naive baseline runs automatically alongside the RLM answer.
                      </div>
                    )}
                  </div>
              </div>
            </div>

            <div className="rlm-section">
              <p className="rlm-sectionLabel">
                Recursion trace · {result.trace.length} step{result.trace.length !== 1 ? "s" : ""}
              </p>
              <div className="rlm-timeline">
                <div className="rlm-timelineLine" />
                {result.trace.map((step, i) => {
                  const cls = badgeClass(step);
                  return (
                    <div className="rlm-step" key={i}>
                      <div className={`rlm-stepBadge rlm-${cls}`}>{i + 1}</div>
                      <div className="rlm-stepCard">
                        <div className="rlm-stepHeader">
                          <span className={`rlm-stepType rlm-${cls}`}>{typeLabel(step)}</span>
                        </div>

                        {step.args && (
                          <div className="rlm-stepBlock">
                            <p className="rlm-stepBlockLabel">Arguments</p>
                            <pre className="rlm-stepPre">{JSON.stringify(step.args, null, 2)}</pre>
                          </div>
                        )}
                        {step.result && (
                          <div className="rlm-stepBlock">
                            <p className="rlm-stepBlockLabel">Result</p>
                            <pre className="rlm-stepPre">{step.result}</pre>
                          </div>
                        )}
                        {step.text && <p className="rlm-stepText">{step.text}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}