import { Funnel_Display } from "next/font/google";
import Image from "next/image";
import {
  getListItemHref,
  type ListItem,
  type ListLogo,
} from "@/components/list-catalog";
import { PikaArrowRightIcon } from "@/components/PikaDockIcons";
import { getButtonClassName } from "@/components/public/Button";
import { cn } from "@/helpers/classname-helper";

const funnelDisplay = Funnel_Display({
  subsets: ["latin"],
  weight: ["300"],
});

function ListLogoMark({
  logo,
  size,
}: {
  logo: ListLogo;
  size: "preview" | "button";
}) {
  if (logo.type === "image") {
    const pixels = size === "preview" ? 40 : 16;

    return (
      <Image
        alt=""
        className={cn(
          "object-contain",
          size === "preview" ? "size-10" : "size-4",
          logo.invertInDark && "dark:invert",
          logo.invertInLight && "invert dark:invert-0",
        )}
        height={pixels}
        src={logo.src}
        width={pixels}
      />
    );
  }

  return (
    <span
      className={cn(
        "text-grayscale-12 leading-none tracking-[-0.04em]",
        logo.font === "funnel"
          ? cn(
              funnelDisplay.className,
              size === "preview" ? "text-[40px]" : "text-[13px]",
            )
          : size === "preview"
            ? "font-mono text-2xl"
            : "font-mono text-[11px]",
      )}
    >
      {logo.text}
    </span>
  );
}

export function ListCard({ item }: { item: ListItem }) {
  return (
    <a
      className="group flex flex-col overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 p-1 small-shadow transition-colors hover:border-grayscale-4 hover:bg-grayscale-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none dark:hover:border-grayscale-6 dark:hover:bg-grayscale-4"
      href={getListItemHref(item.href)}
      rel="noopener noreferrer"
      target="_blank"
    >
      <div
        aria-hidden="true"
        className="flex h-32 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-grayscale-2 transition-colors group-hover:bg-grayscale-3 dark:bg-grayscale-2 dark:group-hover:bg-grayscale-3"
      >
        <ListLogoMark logo={item.logo} size="preview" />
      </div>
      <div className="flex flex-1 flex-col px-2 pt-3 pb-2">
        <h3 className="font-medium text-grayscale-12 text-sm">{item.title}</h3>
        <p className="mt-2 text-pretty text-grayscale-10 text-xs leading-5">
          {item.description}
        </p>
        <div className="mt-auto flex flex-wrap gap-1 pt-3">
          {item.tags.map((tag) => (
            <span
              className={cn(
                "rounded-md px-1.5 py-1 font-medium text-[11px] leading-none",
                tag === "Free"
                  ? "bg-green-3 text-green-11 dark:bg-green-4 dark:text-green-11"
                  : "bg-grayscale-3 text-grayscale-10 dark:bg-grayscale-4 dark:text-grayscale-11",
              )}
              key={tag}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-auto p-1">
        <span
          className={getButtonClassName({
            className:
              "w-full justify-start border-b-2 text-left dark:border-grayscale-5 dark:bg-grayscale-4 dark:hover:border-grayscale-6 dark:hover:bg-grayscale-5",
            variant: "secondary",
          })}
        >
          <ListLogoMark logo={item.logo} size="button" />
          {item.name}
          <PikaArrowRightIcon
            aria-hidden="true"
            className="ml-auto"
            size={14}
          />
        </span>
      </div>
    </a>
  );
}

export function ListGrid({ items }: { items: readonly ListItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-1.5 rounded-[16px] border border-grayscale-3 bg-grayscale-2 p-1.5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <ListCard item={item} key={item.href} />
      ))}
    </div>
  );
}
