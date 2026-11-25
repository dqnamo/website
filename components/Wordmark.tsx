import Link from "next/link";

export function Wordmark({ possessive = false }: { possessive?: boolean }) {
  return (
    <Link
      className="font-bold font-pirata text-4xl text-grayscale-12 tracking-tight"
      href="/"
    >
      {possessive ? "dqnamo's" : "dqnamo"}
    </Link>
  );
}
