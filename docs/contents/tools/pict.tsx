import React, { useEffect, useMemo, useRef, useState } from "react";
import BrowserOnly from "@docusaurus/BrowserOnly";
import { useColorMode } from "@docusaurus/theme-common";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { EditorView, Decoration, type DecorationSet, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { StateEffect, StateField, RangeSetBuilder } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { PictModel, type PictModelIssue } from "covertable/pict";
import type { ControllerStats } from "covertable";

// ---------------------------------------------------------------------------
// Error-line decoration
// ---------------------------------------------------------------------------

const setErrorLines = StateEffect.define<number[]>();

const errorLineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setErrorLines)) {
        const lineNumbers = e.value;
        const totalLines = tr.state.doc.lines;
        const decorations = lineNumbers
          .filter((n) => n >= 1 && n <= totalLines)
          .sort((a, b) => a - b)
          .map((n) =>
            Decoration.line({ class: "cm-error-line" }).range(
              tr.state.doc.line(n).from
            )
          );
        deco = Decoration.set(decorations);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const errorLineTheme = EditorView.baseTheme({
  ".cm-error-line": {
    backgroundColor: "rgba(255, 80, 80, 0.18)",
    boxShadow: "inset 3px 0 0 rgba(255, 80, 80, 0.9)",
  },
});

// ---------------------------------------------------------------------------
// PICT syntax highlighting
// ---------------------------------------------------------------------------

const pictMark = {
  comment: Decoration.mark({ class: "cm-pict-comment" }),
  keyword: Decoration.mark({ class: "cm-pict-keyword" }),
  field: Decoration.mark({ class: "cm-pict-field" }),
  fieldUnknown: Decoration.mark({ class: "cm-pict-field-unknown" }),
  string: Decoration.mark({ class: "cm-pict-string" }),
  set: Decoration.mark({ class: "cm-pict-set" }),
  brace: Decoration.mark({ class: "cm-pict-brace" }),
  negative: Decoration.mark({ class: "cm-pict-negative" }),
  weight: Decoration.mark({ class: "cm-pict-weight" }),
  paramName: Decoration.mark({ class: "cm-pict-param-name" }),
  paramValue: Decoration.mark({ class: "cm-pict-param-value" }),
  operator: Decoration.mark({ class: "cm-pict-operator" }),
  arithmetic: Decoration.mark({ class: "cm-pict-arithmetic" }),
  subModel: Decoration.mark({ class: "cm-pict-sub-model" }),
};

const KEYWORDS_RE = /\b(IF|THEN|ELSE|AND|OR|NOT|IN|LIKE)\b/gi;

function buildPictDecorations(view: EditorView): DecorationSet {
  const tokens: { from: number; to: number; mark: Decoration }[] = [];

  // Collect all parameter names from the document
  const knownParams = new Set<string>();
  for (let i = 1; i <= view.state.doc.lines; i++) {
    const lineText = view.state.doc.line(i).text.trim();
    if (lineText.startsWith("#") || lineText === "") continue;
    if (/^\s*(IF|THEN|ELSE)\b/i.test(lineText)) continue;
    if (/^\s*\{/.test(lineText)) continue;
    const cm = lineText.match(/^([^:]+):/);
    if (cm) knownParams.add(cm[1].trim());
  }

  for (const { from: lineFrom, to: lineTo } of view.visibleRanges) {
    for (let pos = lineFrom; pos < lineTo; ) {
      const line = view.state.doc.lineAt(pos);
      const text = line.text;
      const base = line.from;

      // Comment line
      if (text.trimStart().startsWith("#")) {
        tokens.push({ from: base, to: base + text.length, mark: pictMark.comment });
        pos = line.to + 1;
        continue;
      }

      // Sub-model line: { key1, key2 } @ N
      if (/^\s*\{[^}]*\}\s*@\s*\d+/.test(text)) {
        tokens.push({ from: base, to: base + text.length, mark: pictMark.subModel });
        pos = line.to + 1;
        continue;
      }

      // Parameter line: "Name: val1, val2"
      const paramMatch = text.match(/^([^:]+):/);
      if (paramMatch && !text.match(/^\s*(IF|THEN|ELSE)\b/i)) {
        tokens.push({ from: base, to: base + paramMatch[1].length, mark: pictMark.paramName });

        // Collect negative and weight ranges first (they take priority)
        let m: RegExpExecArray | null;
        const overrides: { from: number; to: number }[] = [];

        const negRe = /~("(?:[^"\\]|\\.)*"|[^,()|\s]+)/g;
        while ((m = negRe.exec(text)) !== null) {
          const f = base + m.index, t = base + m.index + m[0].length;
          tokens.push({ from: f, to: t, mark: pictMark.negative });
          overrides.push({ from: f, to: t });
        }

        const wRe = /\((\d+)\)/g;
        while ((m = wRe.exec(text)) !== null) {
          const f = base + m.index, t = base + m.index + m[0].length;
          tokens.push({ from: f, to: t, mark: pictMark.weight });
          overrides.push({ from: f, to: t });
        }

        // Each comma-separated value after the colon (skip ranges covered by overrides)
        const afterColon = paramMatch[0].length;
        const valRe = /([^,]+)/g;
        const valStr = text.slice(afterColon);
        while ((m = valRe.exec(valStr)) !== null) {
          const vTrimStart = m.index + afterColon + (m[1].length - m[1].trimStart().length);
          const vTrimEnd = m.index + afterColon + m[1].trimEnd().length;
          if (vTrimEnd <= vTrimStart) continue;
          const absFrom = base + vTrimStart, absTo = base + vTrimEnd;
          const hasOverride = overrides.some(o => o.from < absTo && o.to > absFrom);
          if (!hasOverride) {
            tokens.push({ from: absFrom, to: absTo, mark: pictMark.paramValue });
          }
        }

        pos = line.to + 1;
        continue;
      }

      // Constraint line — collect all tokens
      let m: RegExpExecArray | null;

      // Field references [Name]
      const fieldRe = /\[([^\]]*)\]/g;
      while ((m = fieldRe.exec(text)) !== null) {
        const fieldName = m[1].trim();
        const mark = knownParams.has(fieldName) ? pictMark.field : pictMark.fieldUnknown;
        tokens.push({ from: base + m.index, to: base + m.index + m[0].length, mark });
      }

      // Strings "..."
      const strRe = /"(?:[^"\\]|\\.)*"/g;
      while ((m = strRe.exec(text)) !== null) {
        tokens.push({ from: base + m.index, to: base + m.index + m[0].length, mark: pictMark.string });
      }

      // Sets {val, val} — highlight braces separately
      const setRe = /\{([^}]*)\}/g;
      while ((m = setRe.exec(text)) !== null) {
        const start = base + m.index;
        tokens.push({ from: start, to: start + 1, mark: pictMark.brace });
        if (m[1].length > 0) {
          tokens.push({ from: start + 1, to: start + 1 + m[1].length, mark: pictMark.set });
        }
        tokens.push({ from: start + m[0].length - 1, to: start + m[0].length, mark: pictMark.brace });
      }

      // Keywords
      KEYWORDS_RE.lastIndex = 0;
      while ((m = KEYWORDS_RE.exec(text)) !== null) {
        tokens.push({ from: base + m.index, to: base + m.index + m[0].length, mark: pictMark.keyword });
      }

      // Arithmetic operators +, -, *, /, %
      const arithRe = /[+\-*/%]/g;
      while ((m = arithRe.exec(text)) !== null) {
        tokens.push({ from: base + m.index, to: base + m.index + 1, mark: pictMark.arithmetic });
      }

      pos = line.to + 1;
    }
  }

  // Sort by start position, then by length (longer first for overlaps)
  tokens.sort((a, b) => a.from - b.from || b.to - a.to);

  // Deduplicate overlapping ranges — keep the first (highest priority)
  const builder = new RangeSetBuilder<Decoration>();
  let lastTo = 0;
  for (const t of tokens) {
    if (t.from >= lastTo) {
      builder.add(t.from, t.to, t.mark);
      lastTo = t.to;
    }
  }
  return builder.finish();
}

const pictHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildPictDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildPictDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

const pictHighlightTheme = EditorView.baseTheme({
  ".cm-pict-comment": { color: "#6a9955", fontStyle: "italic" },
  ".cm-pict-keyword": { color: "#c586c0", fontWeight: "bold" },
  ".cm-pict-field": { color: "#4ec9b0", fontWeight: "bold" },
  ".cm-pict-field-unknown": { fontStyle: "italic", textDecoration: "line-through", opacity: "0.6" },
  ".cm-pict-string": { color: "#ce9178" },
  ".cm-pict-set": { color: "#ce9178" },
  ".cm-pict-brace": { color: "#d4d4d4", fontWeight: "bold" },
  ".cm-pict-negative": { color: "#f44747", textDecoration: "underline" },
  ".cm-pict-weight": { color: "#b5cea8" },
  ".cm-pict-param-name": { color: "#4ec9b0", fontWeight: "bold" },
  ".cm-pict-param-value": { color: "#79c0d6" },
  ".cm-pict-operator": { color: "#d4d4d4" },
  ".cm-pict-arithmetic": { color: "#569cd6", fontWeight: "bold" },
  ".cm-pict-sub-model": { color: "#dcdcaa" },
});

// ---------------------------------------------------------------------------
// Built-in samples
// ---------------------------------------------------------------------------

interface Sample {
  label: string;
  value: string;
}

const SAMPLES: Sample[] = [
  {
    label: "Storage volume (PICT classic example)",
    value: `# The classic PICT example from Microsoft's documentation.
Type:          Single, Span, Stripe, Mirror, RAID-5
Size:          10, 100, 500, 1000, 5000, 10000, 40000
Format method: Quick, Slow
File system:   FAT, FAT32, NTFS
Cluster size:  512, 1024, 2048, 4096, 8192, 16384, 32768, 65536
Compression:   On, Off

IF [File system] = "FAT"   THEN [Size] <= 4096;
IF [File system] = "FAT32" THEN [Size] <= 32000;
`,
  },
  {
    label: "Negative testing with ~",
    value: `# At most one ~negative value per row, so each error case is exercised
# in isolation while the other parameters stay valid.
Age:     20, 30, 40, ~-1, ~999
Country: Japan, USA, ~"Mars"
Plan:    Free, Pro, ~"Unknown"
`,
  },
  {
    label: "Aliases and weights",
    value: `# "|" defines aliases (use any name in constraints, generate the canonical one).
# "(N)" biases value selection during the row-completion phase.
OS:      Windows | Win | MS, Linux | GNU/Linux, "Mac OS" | Mac
Browser: Chrome (10), Firefox, Safari (3)
Region:  US, EU, JP

IF [OS] = "MS" THEN [Browser] <> "Safari";
`,
  },
];

// ---------------------------------------------------------------------------
// Default model & helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = "covertable-pict-input";
const DEFAULT_INPUT = SAMPLES[0].value;

function loadSavedInput(): string {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved !== null) return saved;
  } catch { /* SSR or disabled storage */ }
  return DEFAULT_INPUT;
}

function copyToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {
      /* ignore */
    });
  }
}

function rowsToTsv(rows: any[], keys: string[]): string {
  const header = keys.join("\t");
  const body = rows.map((r) => keys.map((k) => String(r[k])).join("\t")).join("\n");
  return header + "\n" + body;
}

function totalCombinations(parameters: Record<string, unknown[]>): number {
  return Object.values(parameters).reduce((acc, vs) => acc * vs.length, 1);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PictDemo() {
  return (
    <BrowserOnly fallback={<div>Loading PICT demo…</div>}>
      {() => <PictDemoInner />}
    </BrowserOnly>
  );
}

function PictDemoInner() {
  const { colorMode } = useColorMode();
  const isDark = colorMode === "dark";

  const [input, setInputRaw] = useState<string>(loadSavedInput);
  const setInput = (value: string) => {
    setInputRaw(value);
    try { sessionStorage.setItem(STORAGE_KEY, value); } catch { /* ignore */ }
  };
  const savedInput = loadSavedInput();
  const initialSample = SAMPLES.find((s) => s.value === savedInput);
  const [activeSample, setActiveSample] = useState<string | null>(initialSample?.label ?? null);
  const [generatedFor, setGeneratedFor] = useState<string | null>(null);
  const [generatedKeys, setGeneratedKeys] = useState<string[]>([]);
  const [model, setModel] = useState<PictModel>(() => new PictModel(""));
  const [rows, setRows] = useState<any[]>([]);
  const [outputView, setOutputView] = useState<"table" | "tsv" | "json">("table");
  const [copyTooltip, setCopyTooltip] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const generateStartRef = useRef<number>(0);

  // Tick elapsed time while generating
  useEffect(() => {
    if (!isGenerating) return;
    const id = setInterval(() => {
      setElapsedMs(Date.now() - generateStartRef.current);
    }, 100);
    return () => clearInterval(id);
  }, [isGenerating]);
  const [editorMode, setEditorMode] = useState<"split" | "expand" | "full">("split");
  const [outputFull, setOutputFull] = useState(false);
  const [generatedStats, setGeneratedStats] = useState<ControllerStats | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const optionsRef = useRef<HTMLDivElement | null>(null);

  // Close options popover on outside click
  useEffect(() => {
    if (!showOptions) return;
    const handler = (e: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setShowOptions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showOptions]);
  const [optStrength, setOptStrength] = useState(2);
  const [optCaseSensitive, setOptCaseSensitive] = useState(false);
  const [optCriterion, setOptCriterion] = useState<"greedy" | "simple">("greedy");
  const [optSorter, setOptSorter] = useState<"random" | "hash">("random");
  const cmRef = useRef<ReactCodeMirrorRef | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const extensions = useMemo(() => {
    const base = [errorLineField, errorLineTheme, pictHighlight, pictHighlightTheme];
    return isDark ? [...base, oneDark] : base;
  }, [isDark]);

  // Re-parse on input change so issues/preview reflect the current text.
  // Row generation happens only when the user clicks Generate.
  useEffect(() => {
    setModel(new PictModel(input, { caseInsensitive: !optCaseSensitive }));
    // Clear the active sample if the user has edited it away
    const matched = SAMPLES.find((s) => s.value === input);
    setActiveSample(matched ? matched.label : null);
  }, [input, optCaseSensitive]);

  const handleGenerate = () => {
    if (isGenerating) {
      // Cancel: terminate the worker
      workerRef.current?.terminate();
      workerRef.current = null;
      setIsGenerating(false);
      setStatusMessage(null);
      setEta(null);
      if (editorMode === "expand") setEditorMode("split");
      return;
    }

    setIsGenerating(true);
    setProgress(0);
    setRows([]);
    setGeneratedFor(input);
    setGeneratedStats(null);
    setElapsedMs(null);
    generateStartRef.current = Date.now();

    const worker = new Worker(
      new URL("./generate.worker.ts", import.meta.url)
    );
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const msg = e.data;
      switch (msg.type) {
        case "parsed":
          setGeneratedKeys(msg.keys);
          setModel(new PictModel(input, { caseInsensitive: !optCaseSensitive }));
          break;
        case "status":
          setStatusMessage(msg.message);
          break;
        case "progress":
          setStatusMessage(null);
          setRows(msg.rows);
          setProgress(msg.progress);
          setEta(msg.eta ?? null);
          break;
        case "done":
          setStatusMessage(null);
          setEta(null);
          setElapsedMs(Date.now() - generateStartRef.current);
          setRows(msg.rows);
          setProgress(1);
          setGeneratedStats(msg.stats);
          setIsGenerating(false);
          workerRef.current = null;
          if (editorMode === "expand") setEditorMode("split");
          break;
        case "error":
          setStatusMessage(null);
          setIsGenerating(false);
          workerRef.current = null;
          if (editorMode === "expand") setEditorMode("split");
          break;
      }
    };

    worker.onerror = () => {
      setIsGenerating(false);
      workerRef.current = null;
    };

    worker.postMessage({
      input,
      strength: optStrength,
      criterion: optCriterion,
      sorter: optSorter,
      caseSensitive: optCaseSensitive,
    });
  };

  // Clean up worker on unmount
  useEffect(() => {
    return () => { workerRef.current?.terminate(); };
  }, []);

  // Escape key exits expand/full mode
  useEffect(() => {
    if (editorMode === "split" && !outputFull) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEditorMode("split");
        setOutputFull(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editorMode, outputFull]);

  const isDirty = generatedFor !== input;
  const hasErrors = model.issues.some((i) => i.severity === "error");

  // Push error lines to CodeMirror whenever issues change
  useEffect(() => {
    const view = cmRef.current?.view;
    if (!view) return;
    const lines = Array.from(
      new Set(
        model.issues.filter((i) => i.severity === "error").map((i) => i.line)
      )
    );
    view.dispatch({ effects: setErrorLines.of(lines) });
  }, [model]);

  const factorEntries = Object.entries(model.parameters);
  const factorKeys = factorEntries.map(([k]) => k);

  // Stats
  const total = totalCombinations(model.parameters);
  const reduction =
    total > 0 ? Math.round((1 - rows.length / total) * 100) : 0;

  // Aliases (computed from model — but PictModel doesn't expose them, so we
  // skip showing aliases section unless we add a getter. For now: derive from
  // negatives/weights/subModels which ARE exposed.)
  const negativeEntries = Array.from(model.negatives.entries());
  const weightEntries = Object.entries(model.weights);

  const handleCopy = (text: string) => {
    copyToClipboard(text);
    setCopyTooltip(true);
    window.setTimeout(() => setCopyTooltip(false), 1500);
  };

  return (
    <div className="pict-demo">
      <DemoStyles />

      {/* Samples (collapsible) */}
      <details className="pd-samples-details">
        <summary className="pd-samples-summary">Samples</summary>
        <div className="pd-sample-buttons">
          {SAMPLES.map((s) => (
            <button
              key={s.label}
              type="button"
              className={
                "pd-sample-button" +
                (activeSample === s.label ? " pd-sample-button-active" : "")
              }
              onClick={() => setInput(s.value)}
              title={s.label}
            >
              {s.label}
            </button>
          ))}
          <button
            type="button"
            className="pd-sample-button pd-reset-button"
            onClick={() => {
              setInput(DEFAULT_INPUT);
              try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
            }}
            title="Reset to default sample"
          >
            Reset
          </button>
        </div>
      </details>

      <div className={`pd-grid${editorMode === "expand" ? " pd-grid-expand" : ""}`}>
        {/* LEFT: editor + parsed metadata */}
        <div className="pd-col">
          <div className="pd-col-header">
            <h3>PICT model</h3>
            <label className="pd-switch" title={editorMode === "expand" ? "Back to split view" : "Expand to single column"}>
              <input
                type="checkbox"
                checked={editorMode === "expand"}
                onChange={(e) => setEditorMode(e.target.checked ? "expand" : "split")}
              />
              <span className="pd-switch-track">
                <span className="pd-switch-thumb" />
              </span>
              <span className="pd-switch-label">Expand</span>
            </label>
            <div className="pd-options-wrapper" ref={optionsRef}>
              <button
                type="button"
                className={`pd-options-toggle${showOptions ? " pd-options-toggle-active" : ""}`}
                onClick={() => setShowOptions((v) => !v)}
                title="Generation options"
                aria-label="Generation options"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
              {showOptions && (
                <div className="pd-options-popover">
                  <div className="pd-option-row">
                    <label className="pd-option-label">Strength</label>
                    <select
                      className="pd-option-select"
                      value={optStrength}
                      onChange={(e) => setOptStrength(Number(e.target.value))}
                    >
                      <option value={2}>2 (pairwise)</option>
                      <option value={3}>3 (3-wise) ⚠ slow</option>
                      <option value={4}>4 (4-wise) ⚠ very slow</option>
                    </select>
                  </div>
                  <div className="pd-option-row">
                    <label className="pd-option-label">Criterion</label>
                    <select
                      className="pd-option-select"
                      value={optCriterion}
                      onChange={(e) => setOptCriterion(e.target.value as any)}
                    >
                      <option value="greedy">Greedy</option>
                      <option value="simple">Simple</option>
                    </select>
                  </div>
                  <div className="pd-option-row">
                    <label className="pd-option-label">Sorter</label>
                    <select
                      className="pd-option-select"
                      value={optSorter}
                      onChange={(e) => setOptSorter(e.target.value as any)}
                    >
                      <option value="random">Random</option>
                      <option value="hash">Hash</option>
                    </select>
                  </div>
                  <div className="pd-option-row">
                    <label className="pd-option-label">
                      <input
                        type="checkbox"
                        checked={optCaseSensitive}
                        onChange={(e) => setOptCaseSensitive(e.target.checked)}
                      />
                      {" "}Case sensitive
                    </label>
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              className={
                "pd-button" +
                (isGenerating ? " pd-button-cancel" : " pd-button-generate")
              }
              onClick={handleGenerate}
              disabled={!isGenerating && hasErrors && rows.length === 0}
              title={
                isGenerating
                  ? "Cancel generation"
                  : hasErrors
                  ? "Fix the errors above before generating"
                  : "Generate combinations from the model"
              }
            >
              {isGenerating
                ? "Cancel"
                : editorMode === "expand"
                ? (isDirty ? "Generate & Split" : "Regenerate & Split")
                : (isDirty ? "Generate" : "Regenerate")}
            </button>
          </div>
          <div className={`pd-panel pd-panel-editor${editorMode === "full" ? " pd-panel-fullscreen" : ""}`} style={{ position: "relative" }}>
            <CodeMirror
              ref={cmRef}
              value={input}
              height="100%"
              theme={isDark ? "dark" : "light"}
              extensions={extensions}
              basicSetup={{
                lineNumbers: true,
                highlightActiveLine: true,
                highlightActiveLineGutter: true,
              }}
              onChange={setInput}
            />
            {editorMode === "full" ? (
              <button
                type="button"
                className="pd-close-button"
                onClick={() => setEditorMode("split")}
                title="Exit fullscreen (Esc)"
                aria-label="Exit fullscreen"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                className="pd-editor-full-button"
                onClick={() => setEditorMode("full")}
                title="Fullscreen editor"
                aria-label="Fullscreen editor"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </button>
            )}
          </div>

          {model.issues.length > 0 && <IssueList issues={model.issues} />}

          {/* Parsed metadata */}
          <div className="pd-meta">
            <h4>Parsed factors ({factorKeys.length})</h4>
            {factorKeys.length === 0 ? (
              <p className="pd-muted">No parameters parsed yet.</p>
            ) : (
              <table className="pd-table">
                <thead>
                  <tr>
                    <th>Factor</th>
                    <th>Values</th>
                  </tr>
                </thead>
                <tbody>
                  {factorEntries.map(([key, values]) => (
                    <tr key={key}>
                      <td>
                        <code>{key}</code>
                      </td>
                      <td>{values.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {model.subModels.length > 0 && (
              <>
                <h4>Sub-models ({model.subModels.length})</h4>
                <table className="pd-table">
                  <thead>
                    <tr>
                      <th>Keys</th>
                      <th>Strength</th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.subModels.map((sm, i) => (
                      <tr key={i}>
                        <td>{sm.fields.join(", ")}</td>
                        <td>{sm.strength}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {negativeEntries.length > 0 && (
              <>
                <h4>Negative values</h4>
                <table className="pd-table">
                  <thead>
                    <tr>
                      <th>Factor</th>
                      <th>Values</th>
                    </tr>
                  </thead>
                  <tbody>
                    {negativeEntries.map(([key, set]) => (
                      <tr key={key}>
                        <td>
                          <code>{key}</code>
                        </td>
                        <td>{Array.from(set).join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {weightEntries.length > 0 && (
              <>
                <h4>Weights</h4>
                <table className="pd-table">
                  <thead>
                    <tr>
                      <th>Factor</th>
                      <th>Value → Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weightEntries.map(([key, weights]: [string, any]) => {
                      const values = model.parameters[key] ?? [];
                      return (
                        <tr key={key}>
                          <td>
                            <code>{key}</code>
                          </td>
                          <td>
                            {Object.entries(weights as Record<string, number>).map(
                              ([idx, w], i, arr) => (
                                <span key={idx}>
                                  {String(values[Number(idx)] ?? idx)}={w}
                                  {i < arr.length - 1 ? ", " : ""}
                                </span>
                              )
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}

            {model.constraints.length > 0 && (
              <>
                <h4>Constraints ({model.constraints.length})</h4>
                <p className="pd-muted">
                  {model.constraints.filter((c) => c != null).length} compiled,{" "}
                  {model.constraints.filter((c) => c == null).length} failed
                </p>
              </>
            )}
          </div>
        </div>

        {/* RIGHT: output */}
        <div className="pd-col">
          <div className="pd-col-header">
            <h3>Combinations{isDirty && <span className="pd-dirty">*</span>}</h3>
            <div className="pd-segment">
              <SegmentButton active={outputView === "table"} onClick={() => setOutputView("table")}>
                Table
              </SegmentButton>
              <SegmentButton active={outputView === "tsv"} onClick={() => setOutputView("tsv")}>
                TSV
              </SegmentButton>
              <SegmentButton active={outputView === "json"} onClick={() => setOutputView("json")}>
                JSON
              </SegmentButton>
            </div>
          </div>

          <div className={`pd-panel pd-panel-output${outputFull ? " pd-panel-fullscreen" : ""}`} style={{ position: "relative" }}>
            {generatedKeys.length === 0 ? (
              <p className="pd-muted pd-empty">
                Click <strong>Generate</strong> to produce combinations.
              </p>
            ) : outputView === "table" ? (
              <div className="pd-table-wrapper">
                <table className="pd-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      {generatedKeys.map((key) => (
                        <th key={key}>{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i}>
                        <th>{i + 1}</th>
                        {generatedKeys.map((key) => (
                          <td key={key} className={String(row[key]).startsWith("~") ? "pd-cell-negative" : undefined}>{String(row[key])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : outputView === "tsv" ? (
              <pre className="pd-pre">{rowsToTsv(rows, generatedKeys)}</pre>
            ) : (
              <pre className="pd-pre">{JSON.stringify(rows, null, 2)}</pre>
            )}
            {outputFull ? (
              <button
                type="button"
                className="pd-close-button"
                onClick={() => setOutputFull(false)}
                title="Exit fullscreen (Esc)"
                aria-label="Exit fullscreen"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            ) : generatedKeys.length > 0 && (
              <button
                type="button"
                className="pd-editor-full-button"
                onClick={() => setOutputFull(true)}
                title="Fullscreen output"
                aria-label="Fullscreen output"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </button>
            )}
          </div>

          {/* Progress bar (visible while generating) */}
          {isGenerating && (
            <div className="pd-progress-wrapper">
              <div className="pd-progress" aria-label="Generation progress">
                <div className="pd-progress-bar pd-progress-bar-pulse" />
                <span className="pd-progress-label">
                  {statusMessage
                    ? statusMessage
                    : `Generating… ${rows.length} rows (${Math.round(Math.sqrt(progress) * 100)}%)${eta !== null && eta > 0 ? ` — ~${eta}s left` : ""}`}
                </span>
              </div>
              <span className="pd-help-icon" tabIndex={0}>
                ?
                <span className="pd-help-tooltip">
                  <strong>Preparing…</strong> Building pair combinations and pruning infeasible pairs via constraint propagation. Can take a few seconds for large models or higher strengths.<br /><br />
                  <strong>Generating…</strong> Greedy row construction in progress. The percentage reflects pairs consumed or pruned out of total.
                </span>
              </span>
            </div>
          )}

          {/* Copy / Download */}
          {rows.length > 0 && (
            <div className="pd-export-actions">
              <button
                type="button"
                className="pd-button"
                onClick={() => {
                  const content = outputView === "json"
                    ? JSON.stringify(rows, null, 2)
                    : rowsToTsv(rows, generatedKeys);
                  handleCopy(content);
                }}
              >
                {copyTooltip ? "Copied!" : "Copy"}
              </button>
              <button
                type="button"
                className="pd-button"
                onClick={() => {
                  const content = outputView === "json"
                    ? JSON.stringify(rows, null, 2)
                    : rowsToTsv(rows, generatedKeys);
                  const ext = outputView === "json" ? "json" : "tsv";
                  const mime = outputView === "json" ? "application/json" : "text/tab-separated-values";
                  const blob = new Blob([content], { type: mime });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `combinations.${ext}`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download
              </button>
            </div>
          )}

          {/* Stats below the grid */}
          {generatedKeys.length > 0 && (
            <div className="pd-stats-grid">
              <div className="pd-stats-row">
                <Stat label="Rows" value={rows.length} />
                <Stat label="Factors" value={generatedKeys.length} />
                <Stat
                  label="Reduction"
                  value={total > 0 ? `${reduction}%` : "—"}
                  sub={total > 0 ? `vs ${total >= 1e6 ? total.toExponential(1) : total.toLocaleString()} total` : undefined}
                />
                <Stat
                  label="Time"
                  value={elapsedMs !== null ? (elapsedMs < 1000 ? `${elapsedMs}ms` : `${(elapsedMs / 1000).toFixed(1)}s`) : "—"}
                />
              </div>
              {generatedStats && (
                <div className="pd-stats-row">
                  <Stat
                    label="Total Pairs"
                    value={generatedStats.totalPairs.toLocaleString()}
                  />
                  <Stat
                    label="Pruned"
                    value={generatedStats.prunedPairs.toLocaleString()}
                    sub="infeasible by constraints"
                  />
                  <Stat
                    label="Covered"
                    value={generatedStats.coveredPairs.toLocaleString()}
                    sub={`of ${(generatedStats.totalPairs - generatedStats.prunedPairs).toLocaleString()} feasible`}
                  />
                  <Stat
                    label="Progress"
                    value={`${Math.round(generatedStats.progress * 100)}%`}
                    variant={generatedStats.progress >= 1 ? "success" : "warning"}
                  />
                </div>
              )}
              {generatedStats && generatedStats.completions && Object.keys(generatedStats.completions).length > 0 && (
                <details className="pd-completions">
                  <summary>Completions (factors filled by backtracking)</summary>
                  <div className="pd-completions-body">
                    {Object.entries(generatedStats.completions)
                      .map(([k, v]) => [k, Object.values(v).reduce((a, b) => a + b, 0)] as [string, number])
                      .sort((a, b) => b[1] - a[1])
                      .map(([factor, count]) => (
                        <div key={factor} className="pd-completion-item">
                          <span className="pd-completion-bar-bg">
                            <span
                              className="pd-completion-bar"
                              style={{ width: `${Math.min(100, Math.round((count / rows.length) * 100))}%` }}
                            />
                          </span>
                          <span className="pd-completion-label">{factor}</span>
                          <span className="pd-completion-count">{count}</span>
                        </div>
                      ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Stat({
  label,
  value,
  sub,
  variant,
}: {
  label: string;
  value: number | string;
  sub?: string;
  variant?: "success" | "warning";
}) {
  return (
    <div className={`pd-stat${variant ? ` pd-stat-${variant}` : ""}`}>
      <div className="pd-stat-value">{value}</div>
      <div className="pd-stat-label">{label}</div>
      {sub && <div className="pd-stat-sub">{sub}</div>}
    </div>
  );
}

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={"pd-segment-button" + (active ? " pd-segment-button-active" : "")}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function IssueList({ issues }: { issues: PictModelIssue[] }) {
  return (
    <div className="pd-issues">
      <strong>{issues.length} issue(s):</strong>
      <ul>
        {issues.map((issue, i) => (
          <li key={i}>
            <code>
              [{issue.source}#{issue.index} line {issue.line}]
            </code>{" "}
            {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function DemoStyles() {
  return (
    <style>{`
      .pict-demo {
        --pd-border: var(--ifm-color-emphasis-300);
        --pd-bg-soft: var(--ifm-color-emphasis-100);
        --pd-text: var(--ifm-color-content);
        --pd-muted: var(--ifm-color-emphasis-700);
        --pd-panel-height: 440px;
        color: var(--pd-text);
        margin: 1.5rem 0;
      }
      .pict-demo h3, .pict-demo h4 {
        color: var(--pd-text);
        margin-top: 0;
      }
      .pict-demo h3 {
        margin-bottom: 0;
        line-height: 1.4;
      }
      .pict-demo h4 {
        margin: 1rem 0 0.5rem;
        font-size: 0.95rem;
      }
      .pd-col-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.5rem;
        min-height: 2.2rem;
      }
      .pd-col-header h3 { margin: 0; }
      .pd-col-header > :last-child { margin-left: auto; }
      .pd-dirty {
        color: var(--ifm-color-warning, #e0a800);
        margin-left: 0.25rem;
        font-size: 0.85em;
      }
      .pd-progress-wrapper {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-top: 0.75rem;
      }
      .pd-help-icon {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        font-size: 0.7rem;
        font-weight: 700;
        color: var(--pd-muted);
        background: var(--pd-bg-soft);
        border: 1px solid var(--pd-border);
        border-radius: 50%;
        cursor: help;
        flex-shrink: 0;
      }
      .pd-help-tooltip {
        display: none;
        position: absolute;
        bottom: calc(100% + 8px);
        right: -8px;
        width: 280px;
        padding: 0.6rem 0.75rem;
        font-size: 0.75rem;
        font-weight: 400;
        line-height: 1.5;
        color: var(--pd-text);
        background: var(--ifm-background-surface-color);
        border: 1px solid var(--pd-border);
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 20;
        text-align: left;
        white-space: normal;
      }
      .pd-help-tooltip::after {
        content: "";
        position: absolute;
        top: 100%;
        right: 12px;
        border: 5px solid transparent;
        border-top-color: var(--pd-border);
      }
      .pd-help-icon:hover .pd-help-tooltip,
      .pd-help-icon:focus .pd-help-tooltip {
        display: block;
      }
      .pd-progress {
        position: relative;
        flex: 1;
        height: 20px;
        background: var(--pd-bg-soft);
        border-radius: 999px;
        overflow: hidden;
      }
      .pd-progress-bar {
        position: absolute;
        top: 0; left: 0; bottom: 0;
        background: var(--ifm-color-primary);
        transition: width 0.1s linear;
      }
      .pd-progress-bar-pulse {
        width: 100%;
        opacity: 0.3;
        animation: pd-pulse 1.2s ease-in-out infinite;
      }
      @keyframes pd-pulse {
        0%, 100% { opacity: 0.15; }
        50% { opacity: 0.35; }
      }
      .pd-progress-label {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 0.7rem;
        font-weight: 600;
        color: var(--pd-text);
        white-space: nowrap;
        pointer-events: none;
      }
      .pd-segment {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
      }
      .pd-segment-button {
        font: inherit;
        font-size: 0.8rem;
        padding: 0.3rem 0.7rem;
        background: var(--ifm-background-surface-color);
        color: var(--pd-muted);
        border: 1px solid var(--pd-border);
        border-radius: 4px;
        cursor: pointer;
      }
      .pd-segment-button:hover {
        color: var(--pd-text);
        background: var(--pd-bg-soft);
      }
      .pd-segment-button-active {
        background: var(--ifm-color-primary);
        border-color: var(--ifm-color-primary);
        color: var(--ifm-color-white, #fff);
      }
      .pd-segment-button-active:hover {
        background: var(--ifm-color-primary-darker, var(--ifm-color-primary));
        color: var(--ifm-color-white, #fff);
      }

      .pd-samples-details {
        margin-bottom: 1rem;
        border: 1px solid var(--pd-border);
        border-radius: 6px;
        overflow: hidden;
      }
      .pd-samples-summary {
        padding: 0.4rem 0.75rem;
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--pd-muted);
        background: var(--pd-bg-soft);
        cursor: pointer;
        user-select: none;
      }
      .pd-samples-summary:hover {
        color: var(--pd-text);
      }
      .pd-samples-details[open] .pd-sample-buttons {
        padding: 0.5rem 0.75rem;
      }
      .pd-label {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--ifm-color-info-dark, #4cb3d4);
      }
      .pd-button {
        font: inherit;
        font-size: 0.85rem;
        padding: 0.25rem 0.6rem;
        background: var(--ifm-background-surface-color);
        color: var(--pd-text);
        border: 1px solid var(--pd-border);
        border-radius: 4px;
        cursor: pointer;
      }
      .pd-button:hover:not(:disabled) {
        background: var(--pd-bg-soft);
      }
      .pd-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .pd-button.pd-button-generate {
        background: #2e7d32;
        border-color: #2e7d32;
        color: #fff;
        font-weight: 600;
      }
      .pd-button.pd-button-generate:hover:not(:disabled) {
        background: #1b5e20;
      }
      .pd-button.pd-button-cancel {
        background: #c62828;
        border-color: #c62828;
        color: #fff;
        font-weight: 600;
      }
      .pd-button.pd-button-cancel:hover:not(:disabled) {
        background: #b71c1c;
      }
      .pd-sample-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
      .pd-sample-button {
        font: inherit;
        font-size: 0.8rem;
        padding: 0.3rem 0.7rem;
        background: var(--ifm-background-surface-color);
        color: var(--pd-text);
        border: 1px solid var(--pd-border);
        border-radius: 999px;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s, color 0.15s;
      }
      .pd-sample-button:hover {
        background: var(--pd-bg-soft);
      }
      .pd-sample-button-active {
        background: var(--ifm-color-primary);
        border-color: var(--ifm-color-primary);
        color: var(--ifm-color-white, #fff);
      }
      .pd-sample-button-active:hover {
        background: var(--ifm-color-primary-darker, var(--ifm-color-primary));
      }
      .pd-panel-fullscreen {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        max-height: none !important;
        z-index: 9999;
        border-radius: 0 !important;
        border: none !important;
        overflow: auto !important;
      }
      .pd-editor-full-button {
        position: absolute;
        top: 0.4rem;
        right: 0.4rem;
        z-index: 5;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        padding: 0;
        background: rgba(0,0,0,0.3);
        color: #fff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        opacity: 0.4;
        transition: opacity 0.15s;
      }
      .pd-editor-full-button:hover {
        opacity: 1;
      }
      .pd-close-button {
        position: absolute;
        top: 0.5rem;
        right: 0.5rem;
        z-index: 10000;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        padding: 0;
        background: rgba(0,0,0,0.4);
        color: #fff;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        opacity: 0.6;
        transition: opacity 0.15s;
      }
      .pd-close-button:hover {
        opacity: 1;
      }
      .pd-switch {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        cursor: pointer;
        user-select: none;
      }
      .pd-switch input {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
      }
      .pd-switch-track {
        position: relative;
        width: 28px;
        height: 16px;
        background: var(--pd-border);
        border-radius: 999px;
        transition: background 0.15s;
      }
      .pd-switch input:checked + .pd-switch-track {
        background: var(--ifm-color-primary);
      }
      .pd-switch-thumb {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 12px;
        height: 12px;
        background: #fff;
        border-radius: 50%;
        transition: transform 0.15s;
        box-shadow: 0 1px 2px rgba(0,0,0,0.2);
      }
      .pd-switch input:checked + .pd-switch-track .pd-switch-thumb {
        transform: translateX(12px);
      }
      .pd-switch-label {
        font-size: 0.8rem;
        color: var(--pd-muted);
      }
      .pd-switch input:checked ~ .pd-switch-label {
        color: var(--pd-text);
      }
      .pd-options-wrapper {
        position: relative;
        display: inline-flex;
      }
      .pd-options-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        padding: 0;
        background: var(--ifm-background-surface-color);
        color: var(--pd-muted);
        border: 1px solid var(--pd-border);
        border-radius: 4px;
        cursor: pointer;
        transition: color 0.15s, background 0.15s;
      }
      .pd-options-toggle:hover,
      .pd-options-toggle-active {
        color: var(--pd-text);
        background: var(--pd-bg-soft);
      }
      .pd-options-popover {
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        z-index: 20;
        min-width: 200px;
        padding: 0.6rem 0.75rem;
        background: var(--ifm-background-surface-color);
        border: 1px solid var(--pd-border);
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      }
      .pd-option-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        padding: 0.3rem 0;
      }
      .pd-option-row + .pd-option-row {
        border-top: 1px solid var(--pd-border);
      }
      .pd-option-label {
        font-size: 0.8rem;
        color: var(--pd-text);
        white-space: nowrap;
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
      }
      .pd-option-label input[type="checkbox"] {
        margin: 0;
      }
      .pd-option-select {
        font: inherit;
        font-size: 0.8rem;
        padding: 0.2rem 0.4rem;
        background: var(--ifm-background-surface-color);
        color: var(--pd-text);
        border: 1px solid var(--pd-border);
        border-radius: 4px;
      }
      .pd-reset-button {
        color: var(--pd-muted);
        border-style: dashed;
      }
      .pd-reset-button:hover {
        color: var(--pd-text);
        border-style: solid;
      }
      .pd-export-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 0.5rem;
      }
      .pd-export-actions .pd-button {
        background: var(--ifm-color-primary);
        border-color: var(--ifm-color-primary);
        color: var(--ifm-color-white, #fff);
        font-weight: 600;
      }
      .pd-export-actions .pd-button:hover:not(:disabled) {
        background: var(--ifm-color-primary-darker, var(--ifm-color-primary));
      }

      .pd-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1.5rem;
      }
      .pd-grid-expand {
        grid-template-columns: 1fr;
      }
      @media (max-width: 996px) {
        .pd-grid { grid-template-columns: 1fr; }
      }
      .pd-col { min-width: 0; }

      .pd-panel {
        height: var(--pd-panel-height);
        border: 1px solid var(--pd-border);
        border-radius: var(--ifm-code-border-radius);
        overflow: hidden;
        background: var(--ifm-background-surface-color);
      }
      .pd-panel-editor {
        overflow: auto;
      }
      .pd-panel-output {
        display: flex;
        flex-direction: column;
      }
      .pict-demo .cm-editor {
        height: 100%;
        font-size: 0.85rem;
        border: none;
        border-radius: 0;
      }
      .pict-demo .cm-editor.cm-focused { outline: none; }
      .pict-demo .cm-scroller { overflow: auto; }
      .pd-empty {
        margin: auto;
        text-align: center;
      }

      .pd-issues {
        margin-top: 0.75rem;
        padding: 0.6rem 0.8rem;
        background: rgba(255, 80, 80, 0.08);
        border-left: 3px solid rgba(255, 80, 80, 0.9);
        border-radius: 4px;
        font-size: 0.85rem;
        color: var(--pd-text);
      }
      .pd-issues ul {
        margin: 0.25rem 0 0 1rem;
        padding: 0;
      }
      .pd-issues code {
        background: transparent;
        padding: 0;
        color: var(--pd-muted);
      }

      .pd-meta {
        margin-top: 1rem;
      }
      .pd-muted {
        font-size: 0.85rem;
        color: var(--pd-muted);
      }

      .pd-table {
        /* Override the Docusaurus default of display block so thead sticky works */
        display: table;
        width: 100%;
        font-size: 0.85rem;
        border-collapse: collapse;
        color: var(--pd-text);
      }
      .pd-table thead { display: table-header-group; }
      .pd-table tbody { display: table-row-group; }
      .pd-table tr { display: table-row; }
      .pd-table th, .pd-table td { display: table-cell; }
      .pd-table th, .pd-table td {
        border: 1px solid var(--pd-border);
        padding: 0.3rem 0.55rem;
        text-align: left;
        vertical-align: top;
      }
      .pd-table thead th {
        background: var(--pd-bg-soft);
      }
      .pd-table tbody tr:nth-child(even) td,
      .pd-table tbody tr:nth-child(even) th {
        background: var(--ifm-color-emphasis-100);
      }
      .pd-cell-negative {
        color: #f44747;
      }
      .pd-table-wrapper {
        flex: 1;
        overflow: auto;
      }
      .pd-table-wrapper .pd-table {
        border: none;
        border-collapse: separate;
        border-spacing: 0;
      }
      .pd-table-wrapper .pd-table th,
      .pd-table-wrapper .pd-table td {
        border: none;
        border-right: 1px solid var(--pd-border);
        border-bottom: 1px solid var(--pd-border);
      }
      .pd-table-wrapper .pd-table thead th {
        position: sticky;
        top: 0;
        z-index: 2;
        background: var(--pd-bg-soft);
        /* Use box-shadow because border doesn't stick with sticky cells */
        box-shadow: inset 0 -1px 0 var(--pd-border);
      }

      .pd-stats-grid {
        margin-top: 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .pd-stats-row {
        display: flex;
        gap: 0.5rem;
      }
      .pd-stat {
        flex: 1;
        padding: 0.5rem 0.6rem;
        background: var(--pd-bg-soft);
        border-radius: 6px;
        text-align: center;
        border: 1px solid transparent;
      }
      .pd-stat-success {
        border-color: #2e7d32;
        background: rgba(46, 125, 50, 0.08);
      }
      .pd-stat-warning {
        border-color: #e65100;
        background: rgba(230, 81, 0, 0.08);
      }
      .pd-stat-value {
        font-size: 1.05rem;
        font-weight: 700;
        color: var(--pd-text);
        line-height: 1.3;
      }
      .pd-stat-success .pd-stat-value { color: #2e7d32; }
      .pd-stat-warning .pd-stat-value { color: #e65100; }
      .pd-stat-label {
        font-size: 0.7rem;
        color: var(--pd-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .pd-stat-sub {
        font-size: 0.65rem;
        color: var(--pd-muted);
        margin-top: 0.15rem;
      }

      .pd-completions {
        font-size: 0.85rem;
        color: var(--pd-text);
      }
      .pd-completions summary {
        cursor: pointer;
        font-weight: 600;
        font-size: 0.8rem;
        color: var(--pd-muted);
        padding: 0.3rem 0;
      }
      .pd-completions-body {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        margin-top: 0.4rem;
      }
      .pd-completion-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.8rem;
      }
      .pd-completion-label {
        min-width: 100px;
        font-weight: 500;
        text-align: right;
      }
      .pd-completion-bar-bg {
        flex: 1;
        height: 6px;
        background: var(--pd-bg-soft);
        border-radius: 3px;
        overflow: hidden;
      }
      .pd-completion-bar {
        display: block;
        height: 100%;
        background: var(--ifm-color-primary);
        border-radius: 3px;
        transition: width 0.2s ease;
      }
      .pd-completion-count {
        min-width: 28px;
        text-align: right;
        font-size: 0.75rem;
        color: var(--pd-muted);
        font-variant-numeric: tabular-nums;
      }

      .pd-pre {
        flex: 1;
        overflow: auto;
        padding: 0.75rem;
        background: var(--pd-bg-soft);
        border: none;
        border-radius: 0;
        font-size: 0.8rem;
        color: var(--pd-text);
        margin: 0;
      }
    `}</style>
  );
}
