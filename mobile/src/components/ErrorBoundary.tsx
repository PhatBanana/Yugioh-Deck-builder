import { Component, type ErrorInfo, type ReactNode } from "react";
import { createBackup, exportTextFile } from "../services/backup";
import { onFatalError } from "../lib/crashGuard";

// Catches any render-time crash app-wide and shows a recoverable screen
// instead of a silent black one. This exists because a bad record in
// IndexedDB once crashed every render on launch — force-closing and
// clearing cache did nothing (neither touches stored data), and the only
// way back in was clearing app storage, which wiped an unbacked-up
// collection. The backup button here works from a crashed tree because it
// only touches Dexie directly, never the broken component tree.
//
// Render throws land here via getDerivedStateFromError; fatal async errors
// (database won't open, quota, downgraded APK) land here via the crash
// guard's listener — one recovery screen for both.
interface State {
  error: Error | null;
}

export default class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  private unsubscribe: (() => void) | null = null;

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidMount(): void {
    this.unsubscribe = onFatalError((error) => this.setState({ error }));
  }

  componentWillUnmount(): void {
    this.unsubscribe?.();
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("Render crash caught by AppErrorBoundary:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <CrashScreen error={this.state.error} onReload={() => this.setState({ error: null })} />;
  }
}

function CrashScreen({ error, onReload }: { error: Error; onReload: () => void }) {
  async function backup() {
    try {
      const data = await createBackup();
      const name = `ygo-backup-${data.exportedAt.slice(0, 10)}.json`;
      const outcome = await exportTextFile(name, "application/json", JSON.stringify(data));
      if (outcome === "saved") alert("Backup saved.");
      else if (outcome === "failed") alert("Backup failed to save.");
      // dismissed: the user backed out — no alert needed.
    } catch (e) {
      alert(`Backup failed: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }

  function copyDetails() {
    const text = `${error.name}: ${error.message}\n${error.stack ?? ""}`;
    navigator.clipboard?.writeText(text).then(
      () => alert("Error details copied."),
      () => alert("Couldn't copy — select the text below manually.")
    );
  }

  function reload() {
    window.location.reload();
  }

  async function resetData() {
    if (
      !confirm(
        "This erases your collection, decks, and wishlist on this device. " +
          "Only do this if reloading didn't help and you've backed up first. Continue?"
      )
    )
      return;
    localStorage.clear();
    const dbs = await indexedDB.databases?.();
    await Promise.all(
      (dbs ?? []).map(
        (d) =>
          d.name &&
          new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase(d.name!);
            req.onsuccess = req.onerror = req.onblocked = () => resolve();
          })
      )
    );
    window.location.reload();
  }

  // An older APK opened against a newer database schema: the data is fine,
  // this build is just too old to read it. Wiping data would be exactly the
  // wrong move, so say so explicitly.
  const downgraded = error.name === "VersionError";

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 text-center bg-canvas text-neutral-100">
      <span className="text-4xl">⚠️</span>
      <h1 className="text-lg font-semibold">
        {downgraded ? "This app version is too old" : "Something went wrong"}
      </h1>
      <p className="text-sm text-neutral-400 max-w-sm">
        {downgraded
          ? "Your data was created by a newer version of the app than the one installed. Your collection is intact — install the latest APK from the repo's Releases page and it will open normally. Don't reset your data."
          : "The app hit an error while rendering. Your data on disk is untouched — back it up now if you can, then try reloading."}
      </p>
      <pre className="w-full max-w-sm max-h-32 overflow-auto text-left text-[11px] text-orange-300 bg-surface border border-line rounded-lg p-3 whitespace-pre-wrap">
        {error.name}: {error.message}
      </pre>
      <div className="flex flex-col gap-2 w-full max-w-sm">
        <button type="button" onClick={backup} className="btn-primary py-3 text-sm">
          💾 Back up my data
        </button>
        <button type="button" onClick={copyDetails} className="btn-ghost py-2.5 text-sm">
          Copy error details
        </button>
        <button type="button" onClick={onReload} className="btn-ghost py-2.5 text-sm">
          Try again
        </button>
        <button type="button" onClick={reload} className="btn-ghost py-2.5 text-sm">
          🔄 Reload app
        </button>
        <button type="button" onClick={resetData} className="text-xs text-red-400/80 py-2 mt-2">
          🗑 Reset app data (last resort — erases everything)
        </button>
      </div>
    </div>
  );
}
