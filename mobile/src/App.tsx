import { useEffect, useState } from "react";
import Toaster, { toast } from "./components/Toaster";
import { ConfirmHost } from "./components/Confirm";
import { usePersistentState } from "./hooks/usePersistentState";
import ScanPage from "./pages/ScanPage";
import CardsPage from "./pages/CardsPage";
import DecksPage from "./pages/DecksPage";
import RecommendationsPage from "./pages/RecommendationsPage";
import { initBackButton } from "./services/backButton";
import { migrateLegacyPrintings, recordValueSnapshot } from "./services/collection";
import { recordPriceSnapshots } from "./services/priceHistory";
import { checkForUpdate, openUpdate } from "./services/appUpdate";

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
  const [tab, setTab] = usePersistentState<Tab>("ygo-active-tab", "cards");
  // Immersive = live camera scanning; hide app chrome so the preview (rendered
  // behind the webview) shows through.
  const [immersive, setImmersive] = useState(false);

  useEffect(() => {
    // Android back button closes open popups/sub-views instead of minimizing.
    initBackButton();
    // Best-effort daily snapshots: collection value for the value chart, and
    // per-card prices (owned + wishlisted) for the price-history charts.
    recordValueSnapshot().catch(() => {});
    recordPriceSnapshots().catch(() => {});
    // Fold any pre-breakdown printing/edition data into the copies model.
    migrateLegacyPrintings().catch(() => {});
    // Daily check for a newer APK on the repo's releases (public repo only).
    checkForUpdate()
      .then((u) => {
        if (u) {
          toast(`App update available (v${u.versionName})`, "info", {
            label: "Download",
            onClick: () => openUpdate(u),
          });
        }
      })
      .catch(() => {});
  }, []);

  return (
    // The page background (canvas + glow) lives on <body>, so this div stays
    // transparent — which the camera-scanning mode also relies on.
    <div className="min-h-dvh flex flex-col text-neutral-100">
      {!immersive && (
        <header className="sticky top-0 z-10 bg-canvas/85 backdrop-blur-md px-4 py-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
          <h1 className="font-bold tracking-tight">
            <span className="wordmark bg-gradient-to-r from-amber-300 via-yellow-200 to-yellow-500 bg-clip-text text-transparent">
              YGO
            </span>{" "}
            Deck Builder
          </h1>
          {/* Gold hairline instead of a flat border. */}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-amber-500/50 via-amber-700/20 to-transparent"
          />
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
                  tab === t.id ? "text-amber-300" : "text-neutral-500"
                }`}
              >
                <span
                  className={`text-lg leading-none rounded-full px-3.5 py-1 transition-colors duration-150 ${
                    tab === t.id ? "bg-amber-400/15 pop-in" : ""
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
      <ConfirmHost />
    </div>
  );
}
