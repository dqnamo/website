import Image from "next/image";
import tokyo from "@/public/experiments/stamp-v2/tokyo.png";
import styles from "./stamp-artwork.module.css";

export const stampDesigns = ["01", "02", "03", "04"].map((value) => ({
  id: `tokyo-${value}`,
  title: "Tokyo",
  value,
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
        <div>
          <span className={styles.title}>{design.title}</span>
          <span className={styles.collection}>Japan · 2026</span>
        </div>
        <span className={styles.value}>{design.value}</span>
      </figcaption>
    </figure>
  );
}
