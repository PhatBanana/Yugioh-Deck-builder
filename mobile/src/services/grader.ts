import { analyzeCard, type CardAnalysis } from "@shared/grading/analyze";

// Longest side the analysis runs at. Downscaling keeps the pixel loops fast
// (~1M pixels max) and smooths away camera noise without hiding the border
// transitions or corner whitening we measure.
const MAX_DIM = 1000;

export interface GradePhotoResult {
  analysis: CardAnalysis;
  // Downscaled data-URL of the analyzed photo, for showing what was graded.
  previewUrl: string;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that photo"));
    img.src = src;
  });
}

// Analyzes a card photo (from a camera capture or file pick). Returns null
// when no card-sized region could be found in the frame.
export async function gradeCardPhoto(file: Blob): Promise<GradePhotoResult | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(img, 0, 0, w, h);
    const pixels = ctx.getImageData(0, 0, w, h);
    const analysis = analyzeCard({ data: pixels.data, width: w, height: h });
    if (!analysis) return null;
    return { analysis, previewUrl: canvas.toDataURL("image/jpeg", 0.8) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
