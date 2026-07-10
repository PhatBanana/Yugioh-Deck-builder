// Card thumbnail image with an aspect-ratio placeholder box when there's no
// image. `w`/`h` are Tailwind size classes (h only applies to the placeholder,
// since the image keeps its natural card aspect from its width).
export default function CardThumb({
  img,
  w,
  h,
}: {
  img: string | null | undefined;
  w: string;
  h: string;
}) {
  return img ? (
    <img src={img} alt="" className={`${w} rounded-md ring-1 ring-white/10`} loading="lazy" />
  ) : (
    <div className={`${w} ${h} rounded-md bg-raised ring-1 ring-white/5`} />
  );
}
