import Image from "next/image";
import dublin from "@/public/experiments/stamp-v2/dublin.png";
import london from "@/public/experiments/stamp-v2/london.png";
import sanFrancisco from "@/public/experiments/stamp-v2/san-francisco.png";
import tokyo from "@/public/experiments/stamp-v2/tokyo.png";
import styles from "./stamp-artwork.module.css";

export const stampDesigns = [
  {
    id: "tokyo-01",
    city: "TYO",
    year: "2026",
    image: tokyo,
    alt: "Purple illustration of Tokyo's skyline, Mount Fuji and cherry blossoms",
    ink: "#512181",
  },
  {
    id: "dublin",
    city: "DUB",
    year: "2026",
    image: dublin,
    alt: "Green illustration of Dublin's River Liffey, a bridge and the Spire",
    ink: "#00562e",
  },
  {
    id: "san-francisco",
    city: "SFO",
    year: "2026",
    image: sanFrancisco,
    alt: "Blue illustration of San Francisco's Bay Bridge and skyline",
    ink: "#225da0",
  },
  {
    id: "london",
    city: "LDN",
    year: "2026",
    image: london,
    alt: "Red illustration of London's River Thames, St Paul's Cathedral and skyline",
    ink: "#b71910",
  },
];

export function StampArtwork({
  design,
}: {
  design: (typeof stampDesigns)[number];
}) {
  return (
    <figure
      className={styles.artwork}
      data-design={design.id}
      style={{ color: design.ink }}
    >
      <Image
        alt={design.alt}
        className={styles.image}
        sizes="(max-width: 480px) 40vw, 160px"
        src={design.image}
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
