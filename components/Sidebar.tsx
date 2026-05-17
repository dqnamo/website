"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/helpers/classname-helper";

function SidebarNavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <Link
        href="/"
        onClick={onNavigate}
        className={cn(
          "uppercase font-semibold text-xs font-mono text-grayscale-12 px-2 py-1",
          pathname === "/" ? "text-grayscale-11" : "text-grayscale-9",
        )}
      >
        Home
      </Link>
      <div className="flex flex-col mt-8 px-2">
        <div className="flex flex-row items-center gap-2">
          <span className="text-xs font-mono text-grayscale-9 font-medium uppercase">
            Dark Mode
          </span>
          <ThemeToggle />
        </div>
      </div>
    </>
  );
}

export default function Sidebar() {
  return (
    <aside className="fixed top-0 left-0 z-100 hidden h-full w-64 shrink-0 flex-col gap-px px-4 py-4 xl:flex">
      <SidebarNavContent />
    </aside>
  );
}

export { SidebarNavContent };
