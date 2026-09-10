import styles from "./stamp-artwork.module.css";

export const stampDesigns = [
  { id: "sun", title: "Solstice", value: "01" },
  { id: "sea", title: "Blue hour", value: "02" },
  { id: "dune", title: "Wander", value: "03" },
  { id: "moon", title: "Nightfall", value: "04" },
] as const;

export function StampArtwork({
  design,
}: {
  design: (typeof stampDesigns)[number];
}) {
  return (
    <div
      aria-label={`${design.title}, ${design.value} postage stamp`}
      className={styles.artwork}
      data-design={design.id}
      role="img"
    >
      <div aria-hidden="true" className={styles.print}>
        <div className={styles.masthead}>
          <span>Dqnamo post</span>
          <span>2026</span>
        </div>
        <div className={styles.landscape} />
        <div className={styles.caption}>
          <div>
            <span className={styles.collection}>A little elsewhere</span>
            <span className={styles.title}>{design.title}</span>
          </div>
          <span className={styles.value}>{design.value}</span>
        </div>
      </div>
    </div>
  );
}
