import Link from "next/link";

export function Wordmark() {
  return (
    <Link
      className="inline-flex items-center gap-1.5 font-semibold font-sans text-base text-grayscale-12 tracking-tight"
      href="/"
    >
      <span aria-hidden="true" className="size-3 shrink-0 bg-current" />
      JustifiedPixel
    </Link>
  );
}
