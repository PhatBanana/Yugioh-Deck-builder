import { useEffect, useState } from "react";
import Toaster from "./components/Toaster";
import ScanPage from "./pages/ScanPage";
import CardsPage from "./pages/CardsPage";
import DecksPage from "./pages/DecksPage";
import RecommendationsPage from "./pages/RecommendationsPage";
import ImportPage from "./pages/ImportPage";
import { hideBanner, initAds, showBanner } from "./services/ads";
import { recordValueSnapshot } from "./services/collection";

type Tab = "scan" | "cards" | "decks" | "meta" | "import";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "scan", label: "Scan", icon: "📷" },
  { id: "cards", label: "Cards", icon: "🃏" },
  { id: "decks", label: "Decks", icon: "📚" },
  { id: "meta", label: "Meta", icon: "🏆" },
  { id: "import", label: "Import", icon: "📥" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("scan");
  // Immersive = live camera scanning; hide app chrome so the preview (rendered
  // behind the webview) shows through.
  const [immersive, setImmersive] = useState(false);

  useEffect(() => {
    void initAds();
    // Best-effort daily collection-value snapshot for the value chart.
    recordValueSnapshot().catch(() => {});
  }, []);

  // Hide the banner over the fullscreen camera; show it everywhere else.
  useEffect(() => {
    if (immersive) void hideBanner();
    else void showBanner();
  }, [immersive]);

  return (
    // Reserve space at the top for the native ad banner (drawn over the webview
    // at the top) so it never overlaps the header/content. The var is 0 while
    // the banner is hidden (e.g. during fullscreen scanning).
    <div
      className={`min-h-dvh flex flex-col text-neutral-100 ${immersive ? "" : "bg-neutral-950"}`}
      style={{ paddingTop: "var(--ad-banner-h, 0px)" }}
    >
      {!immersive && (
        <header
          className="sticky z-10 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur px-4 py-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]"
          style={{ top: "var(--ad-banner-h, 0px)" }}
        >
          <h1 className="font-semibold tracking-tight">YGO Deck Builder</h1>
        </header>
      )}

      {/* Bottom padding leaves room for the fixed bottom nav. */}
      <main className="flex-1 pb-24">
        {tab === "scan" && <ScanPage onImmersive={setImmersive} />}
        {tab === "cards" && <CardsPage />}
        {tab === "decks" && <DecksPage />}
        {tab === "meta" && <RecommendationsPage />}
        {tab === "import" && <ImportPage />}
      </main>

      {!immersive && (
        <nav className="fixed inset-x-0 bottom-0 border-t border-neutral-800 bg-neutral-950/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
          <div className="flex">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 text-[11px] ${
                  tab === t.id ? "text-emerald-400" : "text-neutral-500"
                }`}
              >
                <span className="text-lg leading-none">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </nav>
      )}

      <Toaster />
    </div>
  );
}
