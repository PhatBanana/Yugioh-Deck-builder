import { useEffect, useState } from "react";
import Toaster from "./components/Toaster";
import ScanPage from "./pages/ScanPage";
import CardsPage from "./pages/CardsPage";
import DecksPage from "./pages/DecksPage";
import RecommendationsPage from "./pages/RecommendationsPage";
import { hideBanner, initAds, showBanner } from "./services/ads";
import { recordValueSnapshot } from "./services/collection";
import { recordPriceSnapshots } from "./services/priceHistory";

type Tab = "cards" | "scan" | "decks" | "meta";

// Ordered left→right along the natural workflow: your collection (Cards,
// also home to first-run setup), getting cards in (Scan hosts camera, paste
// and deck import), building (Decks), then optimizing against the meta.
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "cards", label: "Cards", icon: "🃏" },
  { id: "scan", label: "Scan", icon: "📷" },
  { id: "decks", label: "Decks", icon: "📚" },
  { id: "meta", label: "Meta", icon: "🏆" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("cards");
  // Immersive = live camera scanning; hide app chrome so the preview (rendered
  // behind the webview) shows through.
  const [immersive, setImmersive] = useState(false);

  useEffect(() => {
    void initAds();
    // Best-effort daily snapshots: collection value for the value chart, and
    // per-card prices (owned + wishlisted) for the price-history charts.
    recordValueSnapshot().catch(() => {});
    recordPriceSnapshots().catch(() => {});
  }, []);

  // Hide the banner over the fullscreen camera; show it everywhere else.
  useEffect(() => {
    if (immersive) void hideBanner();
    else void showBanner();
  }, [immersive]);

  return (
    // Reserve space at the top for the native ad banner (drawn over the webview
    // at the top) so it never overlaps the header/content. The var is 0 while
    // the banner is hidden (e.g. during fullscreen scanning). The page
    // background (canvas + glow) lives on <body>, so this div stays
    // transparent — which the camera-scanning mode also relies on.
    <div
      className="min-h-dvh flex flex-col text-neutral-100"
      style={{ paddingTop: "var(--ad-banner-h, 0px)" }}
    >
      {!immersive && (
        <header
          className="sticky z-10 border-b border-line bg-canvas/85 backdrop-blur-md px-4 py-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]"
          style={{ top: "var(--ad-banner-h, 0px)" }}
        >
          <h1 className="font-bold tracking-tight">
            <span className="bg-gradient-to-r from-emerald-300 to-teal-400 bg-clip-text text-transparent">
              YGO
            </span>{" "}
            Deck Builder
          </h1>
        </header>
      )}

      {/* Bottom padding leaves room for the fixed bottom nav. */}
      <main className="flex-1 pb-24">
        {tab === "cards" && <CardsPage />}
        {tab === "scan" && (
          <ScanPage onImmersive={setImmersive} onGoToCards={() => setTab("cards")} />
        )}
        {tab === "decks" && <DecksPage onGoToCards={() => setTab("cards")} />}
        {tab === "meta" && <RecommendationsPage onGoToCards={() => setTab("cards")} />}
      </main>

      {!immersive && (
        <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-canvas/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
          <div className="flex">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex-1 py-2 flex flex-col items-center gap-0.5 text-[11px] transition-colors duration-150 ${
                  tab === t.id ? "text-emerald-300" : "text-neutral-500"
                }`}
              >
                <span
                  className={`text-lg leading-none rounded-full px-3.5 py-1 transition-colors duration-150 ${
                    tab === t.id ? "bg-emerald-500/15" : ""
                  }`}
                >
                  {t.icon}
                </span>
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
