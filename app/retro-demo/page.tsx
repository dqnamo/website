import type { Metadata } from "next";
import styles from "./retro-demo.module.css";

export const metadata: Metadata = {
  title: "Retro demo | dqnamo",
  description: "A small retro screen header shape demo.",
};

export default function RetroDemoPage() {
  return (
    <main className="min-h-dvh w-full bg-grayscale-1">
      <svg
        aria-label="Black retro screen shape"
        className={`${styles.screenFrame} block h-auto w-full`}
        role="img"
        viewBox="30 20 660 280"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <clipPath id="retro-screen-image">
            <path d="M76 38C190 20 530 20 644 38C666 42 678 64 684 104C690 144 690 176 684 216C678 256 666 278 644 282C530 300 190 300 76 282C54 278 42 256 36 216C30 176 30 144 36 104C42 64 54 42 76 38Z" />
          </clipPath>
          <radialGradient id="crt-vignette" cx="50%" cy="43%" r="74%">
            <stop offset="45%" stopColor="#fff" />
            <stop offset="72%" stopColor="#d8d8d8" />
            <stop offset="100%" stopColor="#5f5f5f" />
          </radialGradient>
          <pattern
            height="4"
            id="crt-scanlines"
            patternUnits="userSpaceOnUse"
            width="4"
          >
            <rect fill="rgb(0 0 0 / 0.22)" height="1" width="4" />
            <rect fill="rgb(255 255 255 / 0.08)" height="1" width="4" y="2" />
          </pattern>
          <filter id="crt-noise" x="0" y="0" width="100%" height="100%">
            <feTurbulence
              baseFrequency="0.9"
              numOctaves="2"
              result="noise"
              seed="8"
              type="fractalNoise"
            />
            <feColorMatrix
              in="noise"
              result="monoNoise"
              type="saturate"
              values="0"
            />
          </filter>
        </defs>
        <image
          className={styles.screenImage}
          clipPath="url(#retro-screen-image)"
          height="280"
          href="https://allthatsinteresting.com/wordpress/wp-content/uploads/2018/11/80s-birthday-party.jpg"
          preserveAspectRatio="xMidYMid slice"
          width="660"
          x="30"
          y="20"
        />
        <rect
          className={styles.scanlines}
          clipPath="url(#retro-screen-image)"
          fill="url(#crt-scanlines)"
          height="280"
          width="660"
          x="30"
          y="20"
        />
        <rect
          className={styles.vignette}
          clipPath="url(#retro-screen-image)"
          fill="url(#crt-vignette)"
          height="280"
          width="660"
          x="30"
          y="20"
        />
        <rect
          className={styles.darkOverlay}
          clipPath="url(#retro-screen-image)"
          fill="rgb(0 0 0 / 0.28)"
          height="280"
          width="660"
          x="30"
          y="20"
        />
        <rect
          className={styles.noise}
          clipPath="url(#retro-screen-image)"
          filter="url(#crt-noise)"
          height="280"
          width="660"
          x="30"
          y="20"
        />
      </svg>
    </main>
  );
}
