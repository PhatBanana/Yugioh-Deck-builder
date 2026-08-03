import { foilClass } from "../lib/foil";

// Card thumbnail image with an aspect-ratio placeholder box when there's no
// image. `w`/`h` are Tailwind size classes (h only applies to the placeholder,
// since the image keeps its natural card aspect from its width). When `rarity`
// is given, a matching foil sheen is overlaid so the card reads as its rarity.
export default function CardThumb({
  img,
  w,
  h,
  rarity,
}: {
  img: string | null | undefined;
  w: string;
  h: string;
  rarity?: string;
}) {
  if (!img) return <div className={`${w} ${h} rounded-md bg-raised ring-1 ring-white/5`} />;
  const foil = foilClass(rarity);
  return (
    <div className={`relative ${w} shrink-0`}>
      <img src={img} alt="" className="w-full rounded-md ring-1 ring-white/10" loading="lazy" />
      {foil && <span aria-hidden className={`foil ${foil}`} />}
    </div>
  );
}
