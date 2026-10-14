type QueueTicketClipProps = {
  id: string;
};

const queueTicketPath =
  "M 0 0 H .12 C .17 .14 .25 .29 .36 .34 C .44 .38 .56 .38 .64 .34 C .75 .29 .83 .14 .88 0 H 1 V .63 H .96 L .9 .65 C .82 .79 .69 .99 .5 1 C .31 .99 .18 .79 .1 .65 L .04 .63 H 0 Z";

export function QueueTicketClip({ id }: QueueTicketClipProps) {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute h-0 w-0"
      focusable="false"
    >
      <clipPath clipPathUnits="objectBoundingBox" id={id}>
        <path d={queueTicketPath} />
      </clipPath>
    </svg>
  );
}

export function QueueTicketNextTab() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-[40%] w-full"
      focusable="false"
      preserveAspectRatio="none"
      viewBox="0 0 176 112"
    >
      <path
        d="M 23 0 H 153 C 143 38 130 78 112 91 C 97 103 79 103 64 91 C 46 78 33 38 23 0 Z"
        fill="#fff"
        stroke="#e5e5e5"
        strokeWidth="1.5"
      />
    </svg>
  );
}
