import type { SVGProps } from "react";

type PikaIconProps = Omit<SVGProps<SVGSVGElement>, "height" | "width"> & {
  size?: number;
};

type SelectablePikaIconProps = PikaIconProps & {
  filled?: boolean;
};

function PikaIcon({ children, size = 16, ...props }: PikaIconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {children}
    </svg>
  );
}

export function PikaHomeIcon({
  filled = false,
  ...props
}: SelectablePikaIconProps) {
  return (
    <PikaIcon {...props}>
      {filled ? (
        <path
          d="M13.49 2.23a5 5 0 0 0-2.98 0c-.61.19-1.136.525-1.68.963-.529.425-1.133.996-1.88 1.702L4.232 7.46c-.657.62-1.111 1.049-1.443 1.567a5 5 0 0 0-.642 1.488C2 11.113 2 11.737 2 12.64v2.003c0 1.084 0 1.958.058 2.666.06.729.185 1.369.487 1.96a5 5 0 0 0 2.185 2.186c.592.302 1.233.428 1.961.487C7.4 22 8.273 22 9.357 22h5.286c1.084 0 1.958 0 2.666-.058.729-.06 1.369-.185 1.961-.487a5 5 0 0 0 2.185-2.185c.302-.592.428-1.232.487-1.961C22 16.6 22 15.727 22 14.643V12.64c0-.903 0-1.527-.148-2.125a5 5 0 0 0-.642-1.488c-.332-.518-.786-.947-1.443-1.567l-2.716-2.565c-.748-.706-1.352-1.277-1.88-1.702-.545-.438-1.071-.773-1.68-.964Z"
          fill="currentColor"
        />
      ) : (
        <path
          d="M3 12.759c0-1.017 0-1.526.119-2.002a4 4 0 0 1 .513-1.19c.265-.414.634-.763 1.374-1.461l2.6-2.456c1.546-1.46 2.32-2.19 3.201-2.466a4 4 0 0 1 2.386 0c.882.275 1.655 1.006 3.201 2.466l2.6 2.456c.74.698 1.11 1.047 1.374 1.46a4 4 0 0 1 .513 1.191c.119.476.119.985.119 2.002V14.6c0 2.24 0 3.36-.436 4.216a4 4 0 0 1-1.748 1.748C17.96 21 16.84 21 14.6 21H9.4c-2.24 0-3.36 0-4.216-.436a4 4 0 0 1-1.748-1.748C3 17.96 3 16.84 3 14.6z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      )}
    </PikaIcon>
  );
}

export function PikaXIcon(props: PikaIconProps) {
  return (
    <PikaIcon {...props}>
      <path
        d="m18.667 4-5.527 6.316M4.667 20l5.895-6.737m2.578-2.947L9.304 4.9c-.233-.33-.35-.494-.5-.613a1.3 1.3 0 0 0-.45-.233C8.169 4 7.967 4 7.564 4H6.063c-.667 0-1 0-1.18.138a.67.67 0 0 0-.26.502c-.009.227.184.499.57 1.043l5.369 7.58m2.578-2.947 5.668 8c.385.545.578.817.569 1.044a.67.67 0 0 1-.26.502c-.18.138-.513.138-1.18.138h-1.5c-.404 0-.606 0-.79-.054a1.3 1.3 0 0 1-.45-.233c-.151-.119-.268-.284-.501-.613l-4.134-5.837"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </PikaIcon>
  );
}

export function PikaArrowRightIcon(props: PikaIconProps) {
  return (
    <PikaIcon {...props}>
      <path
        d="M15.17 6a30.2 30.2 0 0 1 5.62 5.406c.14.174.21.384.21.594m-5.83 6a30.2 30.2 0 0 0 5.62-5.406A.95.95 0 0 0 21 12m0 0H3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </PikaIcon>
  );
}

export function PikaGithubIcon(props: PikaIconProps) {
  return (
    <PikaIcon {...props}>
      <path
        d="M10 15a3.72 3.72 0 0 0-1 2.58V21m5-6a3.72 3.72 0 0 1 1 2.58V21m-6-1.95a5.7 5.7 0 0 1-2.82.36c-1.52-.52-1.12-1.9-1.9-2.47A2.37 2.37 0 0 0 3 16.5m16-6.75c0 3-1.95 5.25-7 5.25s-7-2.25-7-5.25a6.3 6.3 0 0 1 .68-3c-.34-1.47-.21-3.28.52-3.64s2.27.3 3.54 1.15a13 13 0 0 1 2.26-.2 13 13 0 0 1 2.26.18c1.27-.85 2.88-1.48 3.54-1.15s.86 2.17.52 3.64A6.3 6.3 0 0 1 19 9.75Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </PikaIcon>
  );
}

export function PikaCalendarIcon(props: PikaIconProps) {
  return (
    <PikaIcon {...props}>
      <path
        d="M8 2v2.128M8 6V4.128M16 2v2.128M16 6V4.128M20.96 10c.04.788.04 1.755.04 3 0 2.796 0 4.194-.457 5.296a6 6 0 0 1-3.247 3.247C16.194 22 14.796 22 12 22s-4.193 0-5.296-.457a6 6 0 0 1-3.247-3.247C3 17.194 3 15.796 3 13c0-1.245 0-2.212.04-3m17.92 0c-.05-.982-.163-1.684-.417-2.296a6 6 0 0 0-3.247-3.247A5 5 0 0 0 16 4.127M20.96 10H3.04m0 0c.05-.982.163-1.684.417-2.296a6 6 0 0 1 3.247-3.247A5 5 0 0 1 8 4.127m0 0C8.941 4 10.172 4 12 4s3.059 0 4 .128"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </PikaIcon>
  );
}

export function PikaPhoneIcon(props: PikaIconProps) {
  return (
    <PikaIcon {...props}>
      <path
        d="M5.407 12.974c-1.237-2.097-2.05-4.541-2.372-7.265-.141-1.196.6-2.455 1.862-2.662.397-.064.887-.055 1.29-.018 1.684.152 2.38 1.637 2.749 3.079a5.43 5.43 0 0 1-1.57 5.332c-.605.56-1.305 1.032-1.959 1.534Zm0 0a15.8 15.8 0 0 0 5.308 5.43m0 0c2.164 1.344 4.714 2.224 7.572 2.561 1.196.141 2.455-.6 2.662-1.863.07-.433.062-.93.01-1.366-.21-1.77-1.913-2.44-3.435-2.788a5.43 5.43 0 0 0-4.866 1.276c-.714.65-1.311 1.453-1.943 2.18Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </PikaIcon>
  );
}

export function PikaEnvelopeIcon(props: PikaIconProps) {
  return (
    <PikaIcon {...props}>
      <path
        d="m21.803 7.762-5.508 3.505c-1.557.99-2.335 1.486-3.171 1.678a5 5 0 0 1-2.248 0c-.836-.192-1.614-.688-3.171-1.678L2.197 7.762m19.606 0C22 8.722 22 10.006 22 12c0 2.8 0 4.2-.545 5.27a5 5 0 0 1-2.185 2.185C18.2 20 16.8 20 14 20h-4c-2.8 0-4.2 0-5.27-.545a5 5 0 0 1-2.185-2.185C2 16.2 2 14.8 2 12c0-1.994 0-3.278.197-4.238m19.606 0a4 4 0 0 0-.348-1.032 5 5 0 0 0-2.185-2.185C18.2 4 16.8 4 14 4h-4c-2.8 0-4.2 0-5.27.545A5 5 0 0 0 2.545 6.73a4 4 0 0 0-.348 1.032"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </PikaIcon>
  );
}

export function PikaMoonIcon({
  filled = false,
  ...props
}: SelectablePikaIconProps) {
  return (
    <PikaIcon {...props}>
      {filled ? (
        <path
          d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10v-.038a1 1 0 0 0-1.846-.53 5.5 5.5 0 1 1-7.586-7.586A1 1 0 0 0 12.038 2z"
          fill="currentColor"
        />
      ) : (
        <path
          d="M21 11.966A6.5 6.5 0 1 1 12.035 3H12a9 9 0 1 0 9 9z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      )}
    </PikaIcon>
  );
}
