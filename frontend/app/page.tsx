"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ── Types matching backend schemas ─────────────────────────────────────────

interface LearnMoreItem { term: string; explanation: string; }
interface IssueItem { message: string; count: number; }
interface CategoryItem { name: string; count: number; }

interface DiagnosisResponse {
  root_cause: string;
  explanation: string;
  fix_steps: string[];
  learn_more: LearnMoreItem[];
  less_likely_clues: string[];
  uncertainty: string;
}

interface LogSummaryResponse {
  total_lines: number;
  error_count: number;
  warning_count: number;
  info_count: number;
  debug_count: number;
  critical_count: number;
  risk_level: string;
  primary_issue: IssueItem | null;
  most_common_day: string | null;
  problem_issues: IssueItem[];
  context_events: IssueItem[];
  categories: CategoryItem[];
}

interface AnalysisResponse {
  summary: LogSummaryResponse;
  diagnosis: DiagnosisResponse;
}

interface ChallengeScenario {
  id: string;
  title: string;
  difficulty: string;
  framework: string;
  log_text: string;
  hint: string;
}

interface ChallengeResult {
  correct_root_cause: string;
  correct_explanation: string;
  fix_steps: string[];
  learn_more: LearnMoreItem[];
  feedback: string;
  score: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const RISK_COLORS: Record<string, string> = {
  Critical: "text-red-400 bg-red-950 border-red-800",
  High:     "text-orange-400 bg-orange-950 border-orange-800",
  Moderate: "text-yellow-400 bg-yellow-950 border-yellow-800",
  Low:      "text-blue-400 bg-blue-950 border-blue-800",
  Healthy:  "text-emerald-400 bg-emerald-950 border-emerald-800",
};

const SCORE_STYLES: Record<string, { label: string; color: string }> = {
  good:   { label: "✓ Got it",    color: "text-emerald-400 border-emerald-700 bg-emerald-950" },
  close:  { label: "~ Almost",    color: "text-yellow-400 border-yellow-700 bg-yellow-950" },
  missed: { label: "✗ Not quite", color: "text-red-400 border-red-700 bg-red-950" },
};

const DIFF_COLORS: Record<string, string> = {
  beginner:     "text-emerald-400 bg-emerald-950 border-emerald-800",
  intermediate: "text-yellow-400 bg-yellow-950 border-yellow-800",
  advanced:     "text-red-400 bg-red-950 border-red-800",
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body !== undefined ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Request failed");
  }
  return res.json();
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string ?? "");
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-mono font-semibold ${className}`}>
      {children}
    </span>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900 p-5 ${className}`}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-2">{children}</p>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-violet-400" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

// ── File Drop Zone ─────────────────────────────────────────────────────────

function FileDropZone({ onFileLoaded }: { onFileLoaded: (text: string, filename: string) => void }) {
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setFileError(null);
    const allowed = [".log", ".txt", ".json", ".out", ".text"];
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!allowed.includes(ext) && !file.type.startsWith("text/")) {
      setFileError(`Unsupported file type. Use .log, .txt, .json, or .out`);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFileError("File too large — max 5 MB");
      return;
    }
    try {
      const text = await readFileAsText(file);
      onFileLoaded(text, file.name);
    } catch {
      setFileError("Could not read file");
    }
  }, [onFileLoaded]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-5 text-center transition-colors ${
          dragging
            ? "border-violet-500 bg-violet-950"
            : "border-zinc-700 hover:border-zinc-500 bg-zinc-900"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".log,.txt,.json,.out,.text"
          onChange={onInputChange}
          className="hidden"
        />
        <div className="flex flex-col items-center gap-2 pointer-events-none">
          <svg className={`w-7 h-7 ${dragging ? "text-violet-400" : "text-zinc-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <p className={`text-sm ${dragging ? "text-violet-300" : "text-zinc-500"}`}>
            {dragging ? "Drop it!" : "Upload a log file"}
          </p>
          <p className="text-xs text-zinc-600">.log · .txt · .json · .out — max 5 MB</p>
        </div>
      </div>
      {fileError && (
        <p className="mt-2 text-xs text-red-400">{fileError}</p>
      )}
    </div>
  );
}

// ── Diagnosis Card ─────────────────────────────────────────────────────────

function DiagnosisCard({
  diagnosis,
  onIssueClick,
}: {
  diagnosis: DiagnosisResponse;
  onIssueClick?: (issue: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <SectionLabel>Root Cause</SectionLabel>
        <p className="text-white font-semibold text-base leading-snug">{diagnosis.root_cause}</p>
      </Card>

      <Card>
        <SectionLabel>Explanation</SectionLabel>
        <p className="text-zinc-300 text-sm leading-relaxed">{diagnosis.explanation}</p>
      </Card>

      <Card>
        <SectionLabel>Fix Steps</SectionLabel>
        <ol className="space-y-2">
          {diagnosis.fix_steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-zinc-300">
              <span className="shrink-0 w-5 h-5 rounded-full bg-violet-900 text-violet-300 flex items-center justify-center text-xs font-bold">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </Card>

      {diagnosis.less_likely_clues.length > 0 && (
        <Card>
          <SectionLabel>Less Likely Causes</SectionLabel>
          <ul className="space-y-1">
            {diagnosis.less_likely_clues.map((c, i) => (
              <li key={i} className="flex gap-2 text-xs text-zinc-500">
                <span>–</span>
                {onIssueClick ? (
                  <button
                    onClick={() => onIssueClick(c)}
                    className="text-left hover:text-zinc-300 transition-colors underline underline-offset-2 decoration-zinc-700"
                  >
                    {c}
                  </button>
                ) : (
                  <span>{c}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {diagnosis.learn_more.length > 0 && (
        <Card>
          <SectionLabel>Glossary</SectionLabel>
          <dl className="space-y-3">
            {diagnosis.learn_more.map((item, i) => (
              <div key={i}>
                <dt className="text-violet-300 font-mono text-xs font-semibold">{item.term}</dt>
                <dd className="text-zinc-400 text-xs mt-0.5 leading-relaxed">{item.explanation}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      <Card className="border-zinc-700">
        <SectionLabel>Uncertainty</SectionLabel>
        <p className="text-zinc-400 text-xs italic leading-relaxed">{diagnosis.uncertainty}</p>
      </Card>
    </div>
  );
}

// ── Summary Bar ────────────────────────────────────────────────────────────

function SummaryBar({ summary }: { summary: LogSummaryResponse }) {
  const riskClass = RISK_COLORS[summary.risk_level] ?? "text-zinc-400 bg-zinc-800 border-zinc-700";
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge className={riskClass}>{summary.risk_level} risk</Badge>
        {summary.most_common_day && (
          <span className="text-xs text-zinc-500 font-mono">{summary.most_common_day}</span>
        )}
        <span className="text-xs text-zinc-500">{summary.total_lines} lines parsed</span>
      </div>

      <div className="flex flex-wrap gap-3 text-xs font-mono">
        {summary.critical_count > 0 && <span className="text-red-400">{summary.critical_count} CRITICAL</span>}
        {summary.error_count > 0 && <span className="text-orange-400">{summary.error_count} ERROR</span>}
        {summary.warning_count > 0 && <span className="text-yellow-400">{summary.warning_count} WARNING</span>}
        <span className="text-blue-400">{summary.info_count} INFO</span>
        {summary.debug_count > 0 && <span className="text-zinc-500">{summary.debug_count} DEBUG</span>}
      </div>

      {summary.categories.length > 0 && (
        <div>
          <SectionLabel>Categories</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {summary.categories.map((c) => (
              <span key={c.name} className="text-xs font-mono text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                {c.name} ×{c.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {summary.problem_issues.length > 0 && (
        <div>
          <SectionLabel>Top Issues</SectionLabel>
          <ul className="space-y-1">
            {summary.problem_issues.map((issue, i) => (
              <li key={i} className="flex justify-between text-xs">
                <span className="text-zinc-300 font-mono truncate max-w-[80%]">{issue.message}</span>
                <span className="text-zinc-500 ml-2 shrink-0">×{issue.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ── Chat Panel ─────────────────────────────────────────────────────────────

function ChatPanel({
  logText,
  context,
  summary,
  diagnosis,
  selectedIssue,
}: {
  logText: string;
  context: string;
  summary: LogSummaryResponse | null;
  diagnosis: DiagnosisResponse | null;
  selectedIssue: string | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setLoading(true);
    try {
      const data = await apiFetch<{ answer: string }>("/follow-up", {
        log_text: logText,
        context: context || null,
        question: q,
        summary: summary ?? null,
        diagnosis: diagnosis ? {
          root_cause: diagnosis.root_cause,
          fix_steps: diagnosis.fix_steps,
          uncertainty: diagnosis.uncertainty,
        } : null,
        selected_issue: selectedIssue ?? null,
      });
      setMessages((m) => [...m, { role: "assistant", text: data.answer }]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setMessages((m) => [...m, { role: "assistant", text: `Error: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-[400px]">
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-2" style={{ maxHeight: 400 }}>
        {messages.length === 0 && (
          <p className="text-zinc-600 text-xs text-center py-8">
            Ask anything about this log — &quot;What should I check first?&quot; or &quot;Why did this happen?&quot;
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === "user" ? "bg-violet-900 text-white" : "bg-zinc-800 text-zinc-200"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-zinc-800 rounded-xl px-3 py-2"><Spinner /></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 mt-3 border-t border-zinc-800 pt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask a follow-up question…"
          className="flex-1 bg-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-600"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}

// ── Challenge Mode ─────────────────────────────────────────────────────────

function ChallengeMode() {
  const [scenarios, setScenarios] = useState<ChallengeScenario[]>([]);
  const [loadingScenarios, setLoadingScenarios] = useState(true);
  const [selected, setSelected] = useState<ChallengeScenario | null>(null);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<ChallengeResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [filterDiff, setFilterDiff] = useState<string>("");

  useEffect(() => {
    apiFetch<ChallengeScenario[]>("/challenge/scenarios")
      .then(setScenarios)
      .catch(() => setScenarios([]))
      .finally(() => setLoadingScenarios(false));
  }, []);

  async function submit() {
    if (!selected || !answer.trim()) return;
    setSubmitting(true);
    try {
      const r = await apiFetch<ChallengeResult>("/challenge/attempt", {
        scenario_id: selected.id,
        user_answer: answer,
      });
      setResult(r);
    } catch (e: unknown) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setSelected(null);
    setAnswer("");
    setResult(null);
    setShowHint(false);
  }

  const filtered = filterDiff ? scenarios.filter((s) => s.difficulty === filterDiff) : scenarios;

  if (selected) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={reset} className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
            ← Back
          </button>
          <h2 className="text-white font-semibold">{selected.title}</h2>
          <Badge className={DIFF_COLORS[selected.difficulty] ?? "text-zinc-400 bg-zinc-800 border-zinc-700"}>
            {selected.difficulty}
          </Badge>
        </div>

        <Card>
          <SectionLabel>Log to diagnose</SectionLabel>
          <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed overflow-x-auto">
            {selected.log_text}
          </pre>
        </Card>

        {!result && (
          <div className="space-y-3">
            {!showHint ? (
              <button
                onClick={() => setShowHint(true)}
                className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors"
              >
                Show hint
              </button>
            ) : (
              <Card className="border-yellow-900">
                <SectionLabel>Hint</SectionLabel>
                <p className="text-yellow-300 text-sm">{selected.hint}</p>
              </Card>
            )}

            <Card>
              <SectionLabel>Your diagnosis</SectionLabel>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="What do you think caused this? What would you check first?"
                rows={5}
                className="w-full bg-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-600 resize-none"
              />
              <button
                onClick={submit}
                disabled={submitting || !answer.trim()}
                className="mt-3 flex items-center gap-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {submitting && <Spinner />}
                Submit answer
              </button>
            </Card>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <Card className={`border ${SCORE_STYLES[result.score]?.color ?? "border-zinc-700"}`}>
              <div className="flex items-center gap-3 mb-3">
                <Badge className={SCORE_STYLES[result.score]?.color ?? ""}>
                  {SCORE_STYLES[result.score]?.label ?? result.score}
                </Badge>
                <SectionLabel>Feedback</SectionLabel>
              </div>
              <p className="text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap">{result.feedback}</p>
            </Card>

            <Card>
              <SectionLabel>Correct answer</SectionLabel>
              <p className="text-white font-semibold mb-2">{result.correct_root_cause}</p>
              <p className="text-zinc-300 text-sm leading-relaxed mb-4">{result.correct_explanation}</p>
              <SectionLabel>Fix steps</SectionLabel>
              <ol className="space-y-1">
                {result.fix_steps.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-zinc-300">
                    <span className="text-violet-400 font-mono">{i + 1}.</span> {s}
                  </li>
                ))}
              </ol>
            </Card>

            {result.learn_more.length > 0 && (
              <Card>
                <SectionLabel>Glossary</SectionLabel>
                <dl className="space-y-3">
                  {result.learn_more.map((item, i) => (
                    <div key={i}>
                      <dt className="text-violet-300 font-mono text-xs font-semibold">{item.term}</dt>
                      <dd className="text-zinc-400 text-xs mt-0.5 leading-relaxed">{item.explanation}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            )}

            <button
              onClick={reset}
              className="bg-zinc-800 hover:bg-zinc-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Try another scenario
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-white font-semibold">Debug Challenges</h2>
        <div className="flex gap-2">
          {["", "beginner", "intermediate", "advanced"].map((d) => (
            <button
              key={d}
              onClick={() => setFilterDiff(d)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                filterDiff === d
                  ? "border-violet-600 bg-violet-900 text-violet-200"
                  : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
              }`}
            >
              {d || "All"}
            </button>
          ))}
        </div>
      </div>

      {loadingScenarios ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className="text-left rounded-xl border border-zinc-800 bg-zinc-900 hover:border-zinc-600 p-4 transition-colors group"
            >
              <div className="flex items-center gap-2 mb-2">
                <Badge className={DIFF_COLORS[s.difficulty] ?? "text-zinc-400 bg-zinc-800 border-zinc-700"}>
                  {s.difficulty}
                </Badge>
                <span className="text-xs text-zinc-600 font-mono">{s.framework}</span>
              </div>
              <p className="text-white font-medium text-sm group-hover:text-violet-300 transition-colors">
                {s.title}
              </p>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-zinc-600 text-sm col-span-2 text-center py-8">No scenarios for this filter.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

type Tab = "analyze" | "challenge";
type ResultTab = "diagnosis" | "summary" | "chat";

export default function Page() {
  const [tab, setTab] = useState<Tab>("analyze");

  const [logText, setLogText] = useState("");
  const [uploadedFilename, setUploadedFilename] = useState<string | null>(null);
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [resultTab, setResultTab] = useState<ResultTab>("diagnosis");

  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [issueLoading, setIssueLoading] = useState(false);
  const [issueDiagnosis, setIssueDiagnosis] = useState<DiagnosisResponse | null>(null);

  function handleFileLoaded(text: string, filename: string) {
    setLogText(text);
    setUploadedFilename(filename);
    setResult(null);
    setSelectedIssue(null);
    setIssueDiagnosis(null);
    setError(null);
  }

  function clearAll() {
    setResult(null);
    setLogText("");
    setContext("");
    setUploadedFilename(null);
    setSelectedIssue(null);
    setIssueDiagnosis(null);
    setError(null);
  }

  async function analyze() {
    if (!logText.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedIssue(null);
    setIssueDiagnosis(null);
    try {
      const data = await apiFetch<AnalysisResponse>("/diagnose", {
        log_text: logText,
        context: context.trim() || null,
      });
      setResult(data);
      setResultTab("diagnosis");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  async function drillIntoIssue(issue: string) {
    if (!result) return;
    setSelectedIssue(issue);
    setIssueDiagnosis(null);
    setIssueLoading(true);
    setResultTab("diagnosis");
    try {
      const data = await apiFetch<DiagnosisResponse>("/explain-issue", {
        log_text: logText,
        context: context.trim() || null,
        selected_issue: issue,
      });
      setIssueDiagnosis(data);
    } catch (e: unknown) {
      console.error(e);
    } finally {
      setIssueLoading(false);
    }
  }

  function clearIssue() {
    setSelectedIssue(null);
    setIssueDiagnosis(null);
  }

  const activeDiagnosis = issueDiagnosis ?? result?.diagnosis ?? null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-violet-700 flex items-center justify-center">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-white">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
            </svg>
          </div>
          <span className="font-semibold text-white tracking-tight">LogMentor</span>
        </div>

        <nav className="flex gap-1 bg-zinc-900 rounded-lg p-1 border border-zinc-800">
          {(["analyze", "challenge"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                tab === t ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t === "analyze" ? "Analyze Log" : "Challenges"}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {tab === "challenge" ? (
          <ChallengeMode />
        ) : (
          <div className="space-y-6">
            {/* Input area */}
            <div className="space-y-3">

              {/* File upload */}
              <FileDropZone onFileLoaded={handleFileLoaded} />

              {/* Filename pill shown after upload */}
              {uploadedFilename && (
                <div className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 w-fit">
                  <svg className="w-3.5 h-3.5 text-violet-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="font-mono">{uploadedFilename}</span>
                  <button
                    onClick={() => { setUploadedFilename(null); setLogText(""); }}
                    className="ml-1 text-zinc-600 hover:text-zinc-300 transition-colors"
                    aria-label="Remove file"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-zinc-800" />
                <span className="text-xs text-zinc-600">or paste directly</span>
                <div className="flex-1 h-px bg-zinc-800" />
              </div>

              {/* Log textarea */}
              <div>
                <label className="block text-xs uppercase tracking-widest text-zinc-500 font-mono mb-2">
                  Log text
                </label>
                <textarea
                  value={logText}
                  onChange={(e) => { setLogText(e.target.value); setUploadedFilename(null); }}
                  placeholder={"Paste your log here — any format works:\n2026-06-09 09:02:08 ERROR Database connection timed out\n[ERROR] Authentication failed for user admin\nor JSON logs"}
                  rows={10}
                  className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 text-sm font-mono rounded-xl px-4 py-3 placeholder-zinc-700 focus:outline-none focus:ring-1 focus:ring-violet-600 resize-y"
                />
              </div>

              {/* Context */}
              <div>
                <label className="block text-xs uppercase tracking-widest text-zinc-500 font-mono mb-2">
                  Context <span className="normal-case text-zinc-600">(optional)</span>
                </label>
                <input
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="e.g. Django app on AWS, deployed 10 minutes before errors started"
                  className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 text-sm rounded-xl px-4 py-2.5 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-600"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button
                  onClick={analyze}
                  disabled={loading || !logText.trim()}
                  className="flex items-center gap-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                >
                  {loading && <Spinner />}
                  {loading ? "Analyzing…" : "Analyze log"}
                </button>

                {(result || logText) && (
                  <button
                    onClick={clearAll}
                    className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>

              {error && (
                <div className="rounded-xl border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}
            </div>

            {/* Results */}
            {result && (
              <div className="space-y-4">
                {selectedIssue && (
                  <div className="flex items-center gap-3 rounded-xl border border-violet-900 bg-violet-950 px-4 py-2.5 text-sm">
                    <span className="text-violet-400 shrink-0">Focused on:</span>
                    <span className="text-white font-mono text-xs truncate">{selectedIssue}</span>
                    <button
                      onClick={clearIssue}
                      className="ml-auto shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors text-xs"
                    >
                      Back to full diagnosis
                    </button>
                  </div>
                )}

                <div className="flex gap-1 bg-zinc-900 rounded-lg p-1 border border-zinc-800 w-fit">
                  {(["diagnosis", "summary", "chat"] as ResultTab[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setResultTab(t)}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                        resultTab === t ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                {resultTab === "diagnosis" && (
                  <div>
                    {issueLoading ? (
                      <div className="flex items-center gap-3 py-12 justify-center text-zinc-500 text-sm">
                        <Spinner /> Drilling into issue…
                      </div>
                    ) : activeDiagnosis ? (
                      <DiagnosisCard diagnosis={activeDiagnosis} onIssueClick={drillIntoIssue} />
                    ) : null}
                  </div>
                )}

                {resultTab === "summary" && (
                  <div className="space-y-4">
                    <SummaryBar summary={result.summary} />
                    {result.summary.problem_issues.length > 0 && (
                      <Card>
                        <SectionLabel>Click an issue to drill down</SectionLabel>
                        <ul className="space-y-2">
                          {result.summary.problem_issues.map((issue, i) => (
                            <li key={i}>
                              <button
                                onClick={() => drillIntoIssue(issue.message)}
                                className="w-full flex justify-between items-center text-left rounded-lg px-3 py-2 bg-zinc-800 hover:bg-zinc-700 transition-colors group"
                              >
                                <span className="text-zinc-200 font-mono text-xs group-hover:text-violet-300 transition-colors truncate max-w-[85%]">
                                  {issue.message}
                                </span>
                                <span className="text-zinc-500 text-xs shrink-0 ml-2">×{issue.count}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </Card>
                    )}
                  </div>
                )}

                {resultTab === "chat" && (
                  <Card>
                    <ChatPanel
                      logText={logText}
                      context={context}
                      summary={result.summary}
                      diagnosis={result.diagnosis}
                      selectedIssue={selectedIssue}
                    />
                  </Card>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
