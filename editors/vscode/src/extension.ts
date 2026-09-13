import * as vscode from 'vscode';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { PictModel } from 'covertable/pict';
import type { PictModelIssue } from 'covertable/pict';
import { sorters, criteria } from 'covertable';

const LANGUAGE_ID = 'pict';

type CriterionName = 'greedy' | 'simple';
type SorterName = 'random' | 'hash';

function activeUri(): vscode.Uri | undefined {
  return vscode.window.activeTextEditor?.document.uri;
}

/** Where to persist a setting: workspace when one is open, otherwise global. */
function configTarget(): vscode.ConfigurationTarget {
  return vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
}

async function setConfig(key: string, value: unknown): Promise<void> {
  await vscode.workspace.getConfiguration('pict').update(key, value, configTarget());
}

/** Read the effective PICT settings for a given document. */
function getConfig(resource?: vscode.Uri) {
  const cfg = vscode.workspace.getConfiguration('pict', resource);
  return {
    strength: cfg.get<number>('strength', 2),
    criterion: cfg.get<CriterionName>('criterion', 'greedy'),
    sorter: cfg.get<SorterName>('sorter', 'random'),
    caseSensitive: cfg.get<boolean>('caseSensitive', false),
    formula: cfg.get<boolean>('formula.enable', true),
    optimizeEnable: cfg.get<boolean>('optimize.enable', false),
    optimizeBudgetMs: cfg.get<number>('optimize.budgetMs', 5000),
    optimizeWorkers: cfg.get<number>('optimize.workers', 4),
    promptFileName: cfg.get<boolean>('output.promptFileName', true),
    diagnosticsEnabled: cfg.get<boolean>('diagnostics.enable', true),
  };
}

function issueToDiagnostic(
  doc: vscode.TextDocument,
  issue: PictModelIssue,
): vscode.Diagnostic {
  const lineIdx = Math.min(Math.max(issue.line - 1, 0), doc.lineCount - 1);
  const line = doc.lineAt(lineIdx);
  // When an issue carries a token position (e.g. an unknown `[Col]` reference in
  // a formula), underline just that token; otherwise span the whole line.
  let range: vscode.Range;
  if (issue.column != null) {
    const startCol = Math.min(Math.max(issue.column - 1, 0), line.range.end.character);
    const endCol = Math.min(startCol + (issue.length ?? 1), line.range.end.character);
    range = new vscode.Range(lineIdx, startCol, lineIdx, endCol);
  } else {
    range = new vscode.Range(
      line.range.start.translate(0, line.firstNonWhitespaceCharacterIndex),
      line.range.end,
    );
  }
  const severity =
    issue.severity === 'warning'
      ? vscode.DiagnosticSeverity.Warning
      : vscode.DiagnosticSeverity.Error;
  const diag = new vscode.Diagnostic(range, issue.message, severity);
  diag.source = 'pict';
  diag.code = issue.source;
  return diag;
}

function refreshDiagnostics(
  doc: vscode.TextDocument,
  collection: vscode.DiagnosticCollection,
): void {
  if (doc.languageId !== LANGUAGE_ID) {
    return;
  }
  const { caseSensitive, formula, diagnosticsEnabled } = getConfig(doc.uri);
  if (!diagnosticsEnabled) {
    collection.delete(doc.uri);
    return;
  }
  try {
    const model = new PictModel(doc.getText(), { caseInsensitive: !caseSensitive, formula });
    collection.set(doc.uri, model.issues.map((i) => issueToDiagnostic(doc, i)));
  } catch (err) {
    // Parsing itself should never throw in non-strict mode, but guard anyway.
    const message = err instanceof Error ? err.message : String(err);
    const first = doc.lineAt(0).range;
    collection.set(doc.uri, [
      new vscode.Diagnostic(first, message, vscode.DiagnosticSeverity.Error),
    ]);
  }
}

/** Escape a single CSV field per RFC 4180 when the separator is a comma. */
function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function formatTable(
  header: string[],
  rows: Record<string, string | number>[],
  format: 'tsv' | 'csv',
): string {
  const sep = format === 'csv' ? ',' : '\t';
  const cell = (v: string | number) => {
    const s = String(v ?? '');
    return format === 'csv' ? csvField(s) : s.replace(/\t/g, ' ');
  };
  // The header row is always emitted: a `.pict.tsv`/`.pict.csv` file is defined
  // to carry a header (so viewers can treat row 1 as labels and data starts at
  // A1, keeping formula-column cell references aligned).
  const lines: string[] = [header.map(cell).join(sep)];
  for (const row of rows) {
    lines.push(header.map((key) => cell(row[key])).join(sep));
  }
  return lines.join('\n') + '\n';
}

/** Shape of the unsaved state reported by the GridSheet extension's API. */
interface GridsheetUnsaved {
  dirty: boolean;
  evalDirty: boolean;
}

/**
 * Ask the GridSheet viewer whether `uri` is open in a grid with unsaved changes
 * (in-grid edits or computed values the user hasn't saved). Returns undefined
 * when GridSheet isn't installed/active or exposes no such API — in which case
 * there is nothing open to protect. Never force-activates the extension.
 */
async function gridsheetUnsavedState(uri: vscode.Uri): Promise<GridsheetUnsaved | undefined> {
  const ext = vscode.extensions.getExtension('walkframe.csv-gridsheet');
  if (!ext || !ext.isActive) {
    return undefined;
  }
  const api = ext.exports as { getUnsavedState?: (uri: string) => GridsheetUnsaved | undefined } | undefined;
  return api?.getUnsavedState?.(uri.toString());
}

/** Source file's base name without extension, e.g. `.../sample.pict` → `sample`. */
function sourceBase(doc: vscode.TextDocument): string {
  const name =
    doc.uri.scheme === 'file'
      ? path.basename(doc.uri.fsPath)
      : doc.uri.path.split('/').pop() || 'pict';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name || 'pict';
}

/**
 * Write the generated table to `fileName` next to the model and open it.
 * An existing file at that path is overwritten. When the same file is already
 * open (e.g. in a GridSheet grid from a previous run), its tab is closed first and
 * reopened on the fresh content — revealing an already-open custom editor doesn't
 * make it re-read the file, so a plain overwrite wouldn't show. When the source
 * itself is an unsaved buffer (no directory to write into), the result is opened
 * as an untitled document instead, its contents replaced on re-generation.
 */
async function openResult(
  sourceDoc: vscode.TextDocument,
  fileName: string,
  content: string,
  format: 'tsv' | 'csv',
): Promise<void> {
  const langId = format === 'csv' ? 'csv' : 'plaintext';

  if (sourceDoc.uri.scheme === 'file') {
    const target = vscode.Uri.file(path.join(path.dirname(sourceDoc.uri.fsPath), fileName));
    const targetStr = target.toString();

    // Opening an already-open custom editor only *reveals* it — it won't re-read
    // the file — so a re-generation wouldn't show up. Close any tab already showing
    // this file first, then (over)write and open fresh. The document is clean while
    // the grid holds edits only in memory (save-only), so closing never prompts;
    // the pre-generation confirm already covered any unsaved changes.
    const stale = vscode.window.tabGroups.all
      .flatMap((g) => g.tabs)
      .filter((t) => (t.input as { uri?: vscode.Uri } | undefined)?.uri?.toString() === targetStr);
    if (stale.length > 0) {
      await vscode.window.tabGroups.close(stale);
    }

    // Create or overwrite on disk, then open the fresh content.
    await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(content));

    // Same-vendor integration: when enabled (default) and the GridSheet viewer
    // (walkframe.csv-gridsheet) is installed, open the covering array as an
    // editable spreadsheet grid; otherwise fall back to a plain-text document.
    const openInGridsheet = vscode.workspace
      .getConfiguration('pict')
      .get<boolean>('output.openInGridsheet', true);
    if (openInGridsheet && vscode.extensions.getExtension('walkframe.csv-gridsheet')) {
      const gridViewType = format === 'csv' ? 'gridsheet.csv' : 'gridsheet.tsv';
      await vscode.commands.executeCommand('vscode.openWith', target, gridViewType, {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false,
      });
      return;
    }

    const doc = await vscode.workspace.openTextDocument(target);
    await vscode.languages.setTextDocumentLanguage(doc, langId);
    await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: false,
    });
    return;
  }

  // Unsaved source: fall back to an untitled result document.
  const target = vscode.Uri.parse('untitled:' + fileName);
  const doc = await vscode.workspace.openTextDocument(target);
  const edit = new vscode.WorkspaceEdit();
  const end =
    doc.lineCount > 0
      ? doc.lineAt(doc.lineCount - 1).range.end
      : new vscode.Position(0, 0);
  edit.replace(target, new vscode.Range(new vscode.Position(0, 0), end), content);
  await vscode.workspace.applyEdit(edit);
  await vscode.languages.setTextDocumentLanguage(doc, langId);
  await vscode.window.showTextDocument(doc, {
    viewColumn: vscode.ViewColumn.Beside,
    preserveFocus: true,
  });
}

async function generate(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== LANGUAGE_ID) {
    void vscode.window.showWarningMessage(
      'PICT: open a .pict model file to generate a covering array.',
    );
    return;
  }

  const doc = editor.document;
  const {
    strength, criterion, sorter, caseSensitive, formula,
    optimizeEnable, optimizeBudgetMs, optimizeWorkers,
    promptFileName,
  } = getConfig(doc.uri);

  let model: PictModel;
  try {
    model = new PictModel(doc.getText(), { caseInsensitive: !caseSensitive, formula });
  } catch (err) {
    void vscode.window.showErrorMessage(
      `PICT: failed to parse model — ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  const errors = model.issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) {
    const proceed = 'Generate anyway';
    const choice = await vscode.window.showErrorMessage(
      `PICT: model has ${errors.length} error(s). First: line ${errors[0].line} — ${errors[0].message}`,
      proceed,
    );
    if (choice !== proceed) {
      return;
    }
  }

  // Output header includes formula (computed) columns in declaration order;
  // combinatorial generation still needs at least one real parameter.
  const header = model.columnOrder;
  if (Object.keys(model.parameters).length === 0) {
    void vscode.window.showWarningMessage('PICT: no parameters found in the model.');
    return;
  }

  // Decide the output file name up-front (default extension `.pict.tsv`), so a
  // long run is never interrupted by a prompt at the end. It is only a default:
  // the name is fully editable in the prompt below (the base is pre-selected),
  // so it can be changed freely — including the extension.
  const base = sourceBase(doc);
  const defaultName = `${base}.pict.tsv`;
  let fileName = defaultName;
  if (promptFileName) {
    const input = await vscode.window.showInputBox({
      title: 'PICT: output file name',
      value: defaultName,
      valueSelection: [0, base.length],
      prompt: 'Saved next to the model. An existing file with this name is overwritten.',
      validateInput: (v) => (v.trim() === '' ? 'File name cannot be empty' : undefined),
    });
    if (input === undefined) {
      return; // user cancelled
    }
    fileName = input.trim();
  }

  // Format follows the file extension: `.csv` → CSV, anything else → TSV. TSV is
  // just tab-separated text, so it is the safe default for `.tsv`, `.txt`, or any
  // other extension the user picks.
  const effFormat: 'tsv' | 'csv' = fileName.toLowerCase().endsWith('.csv') ? 'csv' : 'tsv';

  // If the target is already open in a GridSheet grid with unsaved changes,
  // confirm before the (later) overwrite — before spending time generating. The
  // grid keeps edits in memory until saved, so the document/disk can't reveal
  // them; GridSheet's extension API does.
  if (doc.uri.scheme === 'file') {
    const target = vscode.Uri.file(path.join(path.dirname(doc.uri.fsPath), fileName));
    let exists = true;
    try {
      await vscode.workspace.fs.stat(target);
    } catch {
      exists = false;
    }
    if (exists) {
      const unsaved = await gridsheetUnsavedState(target);
      if (unsaved && (unsaved.dirty || unsaved.evalDirty)) {
        const proceed = 'Regenerate';
        const choice = await vscode.window.showWarningMessage(
          `"${fileName}" is open with unsaved changes. Regenerate and overwrite them?`,
          { modal: true },
          proceed,
        );
        if (choice !== proceed) {
          return; // keep the open grid as-is
        }
      }
    }
  }

  const makeOptions = {
    strength,
    criterion: criterion === 'simple' ? criteria.simple : criteria.greedy,
    sorter: sorter === 'hash' ? sorters.hash : sorters.random,
  };

  // Drive the generator in time slices so progress paints, the extension host
  // stays responsive, and Cancel actually interrupts a long run.
  const rows: Record<string, string | number>[] = [];
  const started = Date.now();
  let cancelled = false;
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'PICT: generating covering array',
        cancellable: true,
      },
      async (progress, token) => {
        const iter = model.makeAsync(makeOptions);
        let lastPct = 0;
        for (;;) {
          const deadline = Date.now() + 80;
          let done = false;
          while (Date.now() < deadline) {
            if (token.isCancellationRequested) {
              cancelled = true;
              break;
            }
            const next = iter.next();
            if (next.done) {
              done = true;
              break;
            }
            rows.push(next.value as Record<string, string | number>);
          }
          if (cancelled || done) {
            break;
          }
          const p = model.progress; // 0..1 over pair coverage
          const pct = Math.min(99, Math.round(p * 100));
          const elapsed = (Date.now() - started) / 1000;
          const eta =
            p > 0.02 ? ` · ~${Math.max(1, Math.round((elapsed / p) * (1 - p)))}s left` : '';
          progress.report({
            increment: pct - lastPct,
            message: `${rows.length} rows · ${pct}%${eta}`,
          });
          lastPct = pct;
          // Yield to the event loop so the UI repaints and Cancel propagates.
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
      },
    );
  } catch (err) {
    void vscode.window.showErrorMessage(
      `PICT: generation failed — ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  if (cancelled) {
    void vscode.window.showWarningMessage(
      `PICT: generation cancelled after ${rows.length} row(s). Nothing was opened.`,
    );
    return;
  }

  // Optional SA post-process: shrink the greedy array. Uses the parallel
  // (cooperative) optimizer so worker threads do the work and the host UI stays
  // responsive; reuses the model's strength/constraints (no drift).
  const greedyCount = rows.length;
  if (optimizeEnable && rows.length > 1) {
    // Optimization rewrites cell values freely, so it flattens any weighting.
    if (Object.keys(model.weights).length > 0) {
      void vscode.window.showWarningMessage(
        'PICT: optimize is on, so the model\'s value weights are ignored (the optimizer preserves coverage/constraints, not value frequencies).',
      );
    }
    try {
      // Cancelling is safe: optimization is anytime, so an early stop just
      // returns the smallest valid array found so far.
      const abort = new AbortController();
      const optimized = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'PICT: optimizing (simulated annealing) — Cancel to keep the best so far',
          cancellable: true,
        },
        (progress, token) => {
          token.onCancellationRequested(() => abort.abort());
          // onProgress only fires when a *smaller* array is found, so between
          // improvements the message would look frozen. Drive a 1s ticker off our
          // own clock so the elapsed time always advances (= visibly alive), and
          // update the row count whenever the optimizer reports one.
          const optStarted = Date.now();
          let bestRows = greedyCount;
          const render = () =>
            progress.report({
              message: `${bestRows} rows · ${((Date.now() - optStarted) / 1000).toFixed(0)}s`,
            });
          render();
          const ticker = setInterval(render, 1000);
          return model
            .optimizeParallel({
              budgetMs: optimizeBudgetMs,
              workers: Math.max(1, Math.floor(optimizeWorkers)),
              // Point the worker threads at the standalone, vscode-free bundle;
              // the main extension bundle can't be imported from a worker.
              workerUrl: pathToFileURL(path.join(__dirname, 'optimize-worker.mjs')).href,
              signal: abort.signal,
              onProgress: ({ rows: n }) => {
                bestRows = n;
                render();
              },
            })
            .finally(() => clearInterval(ticker));
        },
      );
      rows.length = 0;
      for (const r of optimized) rows.push(r as Record<string, string | number>);
    } catch (err) {
      void vscode.window.showWarningMessage(
        `PICT: optimize failed — ${err instanceof Error ? err.message : String(err)}. Using the greedy result.`,
      );
    }
  }

  // Fill formula (computed) columns: each `[Col]` reference is rewritten to the
  // cell it occupies on this row (see PictModel.renderFormula). Done after any
  // optimize pass so row indices match the final output order.
  const formulaColumns = model.formulaColumns;
  if (formulaColumns.length > 0) {
    for (let i = 0; i < rows.length; i++) {
      for (const fc of formulaColumns) {
        rows[i][fc.name] = model.renderFormula(fc.name, i);
      }
    }
  }

  const content = formatTable(header, rows, effFormat);
  await openResult(doc, fileName, content, effFormat);

  const elapsedMs = Date.now() - started;
  const secs = (elapsedMs / 1000).toFixed(elapsedMs < 10_000 ? 2 : 1);
  const uncovered = model.stats?.uncoveredPairs?.length ?? 0;
  const summary =
    optimizeEnable && rows.length < greedyCount
      ? `PICT: generated ${greedyCount} rows, optimized to ${rows.length} at order ${strength} in ${secs}s.`
      : `PICT: generated ${rows.length} row(s) at order ${strength} in ${secs}s.`;
  if (uncovered > 0) {
    void vscode.window.showWarningMessage(
      `${summary} ${uncovered} pair(s) could not be covered — constraints may be too tight.`,
    );
  } else {
    void vscode.window.showInformationMessage(summary);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection('pict');
  context.subscriptions.push(diagnostics);

  // Debounce per-document while typing.
  const timers = new Map<string, NodeJS.Timeout>();
  const scheduleRefresh = (doc: vscode.TextDocument) => {
    if (doc.languageId !== LANGUAGE_ID) {
      return;
    }
    const key = doc.uri.toString();
    const existing = timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        refreshDiagnostics(doc, diagnostics);
      }, 300),
    );
  };

  // ---- Status-bar footer: options + Generate button (shown for .pict files) ----
  const bar: vscode.StatusBarItem[] = [];
  const mkItem = (priority: number, command?: string): vscode.StatusBarItem => {
    const it = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority);
    if (command) it.command = command;
    context.subscriptions.push(it);
    bar.push(it);
    return it;
  };
  const labelItem = mkItem(101); // non-clickable group label
  const strengthItem = mkItem(100, 'pict.pickStrength');
  const settingsItem = mkItem(99, 'pict.openSettings');
  const generateItem = mkItem(96, 'pict.generate');

  // Make the Generate button read as a primary action, not just text.
  generateItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');

  const updateStatusBar = () => {
    const ed = vscode.window.activeTextEditor;
    if (!ed || ed.document.languageId !== LANGUAGE_ID) {
      bar.forEach((i) => i.hide());
      return;
    }
    const c = getConfig(ed.document.uri);
    labelItem.text = '$(beaker) PICT';
    labelItem.tooltip = 'PICT options — Strength to the right, more in ⚙ Settings; ▷ Generate runs the model.';
    strengthItem.text = `$(symbol-number) Strength: ${c.strength}`;
    strengthItem.tooltip = 'PICT combinatorial order — click to change';
    settingsItem.text = c.optimizeEnable ? '$(gear) Settings $(sparkle)' : '$(gear) Settings';
    settingsItem.tooltip = 'PICT settings — criterion, sorter, optimize (SA), case, output';
    generateItem.text = '$(play) Generate';
    generateItem.tooltip = 'PICT: Generate Covering Array';
    bar.forEach((i) => i.show());
    maybeShowFooterHint();
  };

  // One-time nudge so people find the footer instead of hunting for options.
  const HINT_KEY = 'pict.footerHintShown';
  const maybeShowFooterHint = () => {
    if (context.globalState.get<boolean>(HINT_KEY)) return;
    void context.globalState.update(HINT_KEY, true);
    void vscode.window.showInformationMessage(
      'PICT: Strength and the ▷ Generate button are in the status bar (bottom-left). Other options — criterion, sorter, optimize, output — are behind the ⚙ Settings item.',
    );
  };

  type NumberedPick = vscode.QuickPickItem & { value: number };
  const pickStrength = async () => {
    const cur = getConfig(activeUri()).strength;
    const presets: NumberedPick[] = [2, 3, 4, 5, 6].map((n) => ({
      label: String(n),
      description: n === 2 ? 'pairwise' : n === 3 ? 'triple-wise' : `${n}-wise`,
      value: n,
    }));
    const picked = await vscode.window.showQuickPick<NumberedPick>(
      [...presets, { label: 'Custom…', description: 'enter a number', value: -1 }],
      { title: 'PICT Strength', placeHolder: `current: ${cur}` },
    );
    if (!picked) return;
    let value = picked.value;
    if (value === -1) {
      const input = await vscode.window.showInputBox({
        title: 'PICT Strength',
        value: String(cur),
        validateInput: (v) => (/^\d+$/.test(v) && +v >= 1 ? undefined : 'Enter an integer ≥ 1'),
      });
      if (input === undefined) return;
      value = parseInt(input, 10);
    }
    await setConfig('strength', value);
  };
  const pickCriterion = async () => {
    const cur = getConfig(activeUri()).criterion;
    const picked = await vscode.window.showQuickPick(
      [
        { label: 'greedy', description: 'fewest rows (default)' },
        { label: 'simple', description: 'lighter packing' },
      ],
      { title: 'PICT Criterion', placeHolder: `current: ${cur}` },
    );
    if (picked) await setConfig('criterion', picked.label);
  };
  const pickSorter = async () => {
    const cur = getConfig(activeUri()).sorter;
    const picked = await vscode.window.showQuickPick(
      [
        { label: 'random', description: 'varies between runs (default)' },
        { label: 'hash', description: 'deterministic across runs' },
      ],
      { title: 'PICT Sorter', placeHolder: `current: ${cur}` },
    );
    if (picked) await setConfig('sorter', picked.label);
  };
  const toggleCase = async () => {
    await setConfig('caseSensitive', !getConfig(activeUri()).caseSensitive);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('pict.generate', generate),
    vscode.commands.registerCommand('pict.pickStrength', pickStrength),
    vscode.commands.registerCommand('pict.pickCriterion', pickCriterion),
    vscode.commands.registerCommand('pict.pickSorter', pickSorter),
    vscode.commands.registerCommand('pict.toggleCaseSensitive', toggleCase),
    vscode.commands.registerCommand('pict.openSettings', () =>
      vscode.commands.executeCommand('workbench.action.openSettings', '@ext:walkframe.pict-covertable'),
    ),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('pict')) updateStatusBar();
    }),
    vscode.window.onDidChangeActiveTextEditor(() => updateStatusBar()),
    vscode.workspace.onDidOpenTextDocument((doc) => refreshDiagnostics(doc, diagnostics)),
    vscode.workspace.onDidChangeTextDocument((e) => scheduleRefresh(e.document)),
    vscode.workspace.onDidCloseTextDocument((doc) => diagnostics.delete(doc.uri)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('pict')) {
        updateStatusBar();
        for (const doc of vscode.workspace.textDocuments) {
          refreshDiagnostics(doc, diagnostics);
        }
      }
    }),
  );

  updateStatusBar();

  // Lint any documents already open at activation time.
  for (const doc of vscode.workspace.textDocuments) {
    refreshDiagnostics(doc, diagnostics);
  }
}

export function deactivate(): void {
  /* nothing to clean up beyond disposables */
}
