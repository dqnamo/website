import Image from "next/image";
import tokyo from "@/public/experiments/stamp-v2/tokyo.png";
import styles from "./stamp-artwork.module.css";

export const stampDesigns = ["01", "02", "03", "04"].map((value) => ({
  id: `tokyo-${value}`,
  city: "TYO",
  year: "2026",
}));

export function StampArtwork({
  design,
}: {
  design: (typeof stampDesigns)[number];
}) {
  return (
    <figure className={styles.artwork} data-design={design.id}>
      <Image
        alt="Purple illustration of Tokyo's skyline, Mount Fuji and cherry blossoms"
        className={styles.image}
        sizes="(max-width: 480px) 40vw, 160px"
        src={tokyo}
      />
      <figcaption className={styles.caption}>
        <span className={styles.city}>{design.city}</span>
        <span className={styles.year}>
          <span className="sr-only">{design.year}</span>
          <span aria-hidden="true">{design.year.slice(0, 2)}</span>
          <span aria-hidden="true">{design.year.slice(2)}</span>
        </span>
      </figcaption>
    </figure>
  );
}
