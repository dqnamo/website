import Image from "next/image";
import { Fragment } from "react";
import { cn } from "@/helpers/classname-helper";
import { getPerson, initialsOf, type Person } from "@/lib/people";

const mentionPattern = /@([a-z][a-z0-9]*)/g;

/** Text with `@id` mentions turned into people. Unknown ids stay as typed. */
export function MentionText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;

  for (const match of text.matchAll(mentionPattern)) {
    const person = getPerson(match[1]);
    if (!person) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`No person "${match[1]}" in lib/people.ts`);
      }
      continue;
    }
    parts.push(text.slice(last, match.index));
    parts.push(<PersonMention key={match.index} person={person} />);
    last = match.index + match[0].length;
  }
  parts.push(text.slice(last));

  return parts.map((part, index) =>
    // biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder.
    typeof part === "string" ? <Fragment key={index}>{part}</Fragment> : part,
  );
}

export function PersonMention({ person }: { person: Person }) {
  const body = (
    <span className="whitespace-nowrap">
      <PersonAvatar person={person} />
      <span
        className={cn(
          "text-grayscale-12",
          person.href &&
            "underline decoration-grayscale-6 underline-offset-2 transition-colors group-hover:decoration-grayscale-10",
        )}
      >
        {person.name}
      </span>
    </span>
  );

  if (!person.href) {
    return <span title={person.fullName}>{body}</span>;
  }

  return (
    <a
      className="group"
      href={person.href}
      rel="noopener noreferrer"
      target="_blank"
      title={person.fullName}
    >
      {body}
    </a>
  );
}

function PersonAvatar({ person }: { person: Person }) {
  return (
    // An inline-block with overflow hidden sits on its bottom edge rather than
    // on the initial's baseline, so this offset centres it on the capitals.
    <span
      aria-hidden="true"
      className="mr-1 inline-block size-4 overflow-hidden rounded-full bg-grayscale-4 align-[-3px] ring-1 ring-grayscale-5 dark:bg-grayscale-5 dark:ring-grayscale-6"
    >
      {person.photo ? (
        <Image
          alt=""
          className="size-full object-cover"
          height={16}
          src={person.photo}
          width={16}
        />
      ) : (
        <span className="flex size-full items-center justify-center font-medium text-[8px] text-grayscale-11 leading-none">
          {initialsOf(person.name).slice(0, 1)}
        </span>
      )}
    </span>
  );
}
