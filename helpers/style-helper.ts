import { cn } from "@/helpers/classname-helper";

type ClassTree = string | { readonly [key: string]: ClassTree };

export type DefinedStyles<T> = T extends string
  ? string
  : {
      readonly [K in keyof T]: DefinedStyles<T[K]>;
    } & {
      readonly $: string;
      readonly $classNames: string;
    };

const RESERVED_KEYS = new Set(["$", "$classNames"]);

export function defineStyles<const T extends Record<string, ClassTree>>(
  styles: T,
): DefinedStyles<T> {
  return defineNode(styles, "styles") as DefinedStyles<T>;
}

function defineNode(node: ClassTree, path: string): unknown {
  if (typeof node === "string") {
    return node;
  }

  const output: Record<string, unknown> = {};
  const classNames: string[] = [];

  for (const [key, value] of Object.entries(node)) {
    if (RESERVED_KEYS.has(key)) {
      throw new Error(
        `defineStyles: "${path}.${key}" is a reserved style key.`,
      );
    }

    const defined = defineNode(value, `${path}.${key}`);

    output[key] = defined;
    classNames.push(
      typeof defined === "string" ? defined : (defined as { $: string }).$,
    );
  }

  const flattened = cn(...classNames);

  output.$ = flattened;
  output.$classNames = flattened;

  return output;
}
