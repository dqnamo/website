"use client";

import { Popover } from "@base-ui/react/popover";
import NumberFlow from "@number-flow/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BackspaceIcon,
  CaretRightIcon,
  CheckIcon,
  KeyReturnIcon,
  PlusIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
} from "motion/react";
import {
  type ComponentPropsWithoutRef,
  createContext,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/helpers/classname-helper";

export type FilterFieldType = "select" | "text" | "number" | "date";

export type FilterOperator =
  | "is"
  | "is_not"
  | "is_any_of"
  | "is_none_of"
  | "contains"
  | "does_not_contain"
  | "gt"
  | "lt"
  | "eq"
  | "in_last"
  | "before"
  | "after";

export type FilterOption = {
  /** Stored in `Filter.values`. For date fields this is a number of days. */
  value: string;
  label: string;
  icon?: ReactNode;
  /** Optional number of matching rows, shown beside the option. */
  count?: number;
  keywords?: readonly string[];
};

export type FilterField = {
  key: string;
  label: string;
  type: FilterFieldType;
  icon?: ReactNode;
  /** Select options, or relative date presets measured in days. */
  options?: readonly FilterOption[];
  /** Used when several values collapse into a count, e.g. "3 statuses". */
  pluralLabel?: string;
  /** Suffix for number values, e.g. "pts". */
  unit?: string;
};

export type Filter = {
  id: string;
  field: string;
  operator: FilterOperator;
  values: string[];
};

export type FilterQueryBuilderRootProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children" | "onChange"
> & {
  children: ReactNode;
  fields: readonly FilterField[];
  filters: readonly Filter[];
  onFiltersChange: (filters: Filter[]) => void;
  /**
   * Called with the filters that would apply if the highlighted option were
   * chosen, or `null` when nothing is being previewed.
   */
  onPreviewChange?: (filters: Filter[] | null) => void;
  /** Single key that opens the add-filter menu. Pass `null` to disable. */
  hotkey?: string | null;
};

export type FilterQueryBuilderListProps = ComponentPropsWithoutRef<"div">;

export type FilterQueryBuilderAddProps = {
  children?: ReactNode;
  className?: string;
};

export type FilterQueryBuilderClearProps = {
  children?: ReactNode;
  className?: string;
};

type Step = "field" | "operator" | "value";
type Segment = "field" | "operator" | "value" | "remove";
type EditorTarget = "add" | Exclude<Segment, "remove">;

type Draft = {
  id: string;
  field: string | null;
  operator: FilterOperator | null;
  values: string[];
};

type Editor = {
  direction: 1 | -1;
  draft: Draft;
  step: Step;
  target: EditorTarget;
};

type Peek = { operator?: FilterOperator; values?: string[] };

type TokenModel = {
  filter: Filter;
  isGhost: boolean;
  pending: boolean;
  tentative: boolean;
};

type FocusRequest = { segment: Segment; tokenId: string } | "add";

type FilterQueryBuilderContextValue = {
  chooseField: (key: string) => void;
  chooseOperator: (operator: FilterOperator) => void;
  clear: () => void;
  close: (restoreFocus?: boolean) => void;
  editor: Editor | null;
  fieldMap: ReadonlyMap<string, FilterField>;
  fields: readonly FilterField[];
  filters: readonly Filter[];
  ghostAnchor: HTMLElement | null;
  goToStep: (step: Step) => void;
  hotkey: string | null;
  openAdd: () => void;
  openEdit: (filterId: string, target: EditorTarget) => void;
  pickValue: (value: string) => void;
  registerGhostAnchor: (element: HTMLElement | null) => void;
  removeFilter: (filterId: string, segment?: Segment) => void;
  setPeek: (peek: Peek | null) => void;
  shouldMove: boolean;
  toggleValue: (value: string) => void;
  tokens: readonly TokenModel[];
};

const FilterQueryBuilderContext =
  createContext<FilterQueryBuilderContextValue | null>(null);

const easeOut = [0.23, 1, 0.32, 1] as const;
const sizeSpring = { bounce: 0, duration: 0.32, type: "spring" } as const;
const instant = { duration: 0 } as const;
const DAY_MS = 86_400_000;

const operatorsByType: Record<FilterFieldType, readonly FilterOperator[]> = {
  select: ["is", "is_not", "is_any_of", "is_none_of"],
  text: ["contains", "does_not_contain"],
  number: ["gt", "lt", "eq"],
  date: ["in_last", "before", "after"],
};

const operatorCopy: Record<FilterOperator, { label: string; symbol?: string }> =
  {
    is: { label: "is" },
    is_not: { label: "is not" },
    is_any_of: { label: "is any of" },
    is_none_of: { label: "is none of" },
    contains: { label: "contains" },
    does_not_contain: { label: "does not contain" },
    gt: { label: "greater than", symbol: ">" },
    lt: { label: "less than", symbol: "<" },
    eq: { label: "equal to", symbol: "=" },
    in_last: { label: "in the last" },
    before: { label: "before" },
    after: { label: "after" },
  };

const defaultDatePresets: readonly FilterOption[] = [
  { value: "1", label: "1 day" },
  { value: "3", label: "3 days" },
  { value: "7", label: "1 week" },
  { value: "14", label: "2 weeks" },
  { value: "30", label: "1 month" },
  { value: "90", label: "3 months" },
];

const numberPattern = /^-?\d+(\.\d+)?$/;

const segmentClassName =
  "relative flex h-full shrink-0 cursor-pointer items-center gap-1.5 px-2 outline-none transition-colors duration-150 hover:bg-grayscale-2 focus-visible:bg-grayscale-2 focus-visible:ring-2 focus-visible:ring-grayscale-7 focus-visible:ring-inset data-[popup-open]:bg-grayscale-3 dark:hover:bg-grayscale-4 dark:data-[popup-open]:bg-grayscale-5 dark:focus-visible:bg-grayscale-4";

const popupClassName =
  "w-64 origin-[var(--transform-origin)] overflow-hidden rounded-xl border border-grayscale-4 bg-grayscale-1 text-grayscale-12 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_20px_-8px_rgba(0,0,0,0.14),0_20px_40px_-20px_rgba(0,0,0,0.12)] outline-none transition-[opacity,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] data-[ending-style]:scale-[0.98] data-[starting-style]:scale-[0.96] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:data-[ending-style]:scale-100 motion-reduce:data-[starting-style]:scale-100 dark:border-grayscale-5 dark:bg-grayscale-3 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),0_16px_32px_-12px_rgba(0,0,0,0.5)]";

function useFilterQueryBuilder(component: string) {
  const context = useContext(FilterQueryBuilderContext);

  if (!context) {
    throw new Error(
      `${component} must be used inside FilterQueryBuilder.Root.`,
    );
  }

  return context;
}

function getOperators(field: FilterField) {
  return operatorsByType[field.type];
}

function getOptions(field: FilterField) {
  return field.options ?? (field.type === "date" ? defaultDatePresets : []);
}

function isMultiOperator(operator: FilterOperator | null) {
  return operator === "is_any_of" || operator === "is_none_of";
}

function normalizeFilter(filter: Filter, field?: FilterField): Filter {
  if (field?.type !== "select" || filter.values.length < 2) {
    return filter;
  }

  if (filter.operator === "is") {
    return { ...filter, operator: "is_any_of" };
  }

  if (filter.operator === "is_not") {
    return { ...filter, operator: "is_none_of" };
  }

  return filter;
}

function upsertFilter(filters: readonly Filter[], filter: Filter) {
  const exists = filters.some((item) => item.id === filter.id);

  return exists
    ? filters.map((item) => (item.id === filter.id ? filter : item))
    : [...filters, filter];
}

function draftToFilter(draft: Draft, peek?: Peek | null): Filter | null {
  if (!draft.field || !draft.operator) {
    return null;
  }

  return {
    field: draft.field,
    id: draft.id,
    operator: peek?.operator ?? draft.operator,
    values: peek?.values ?? draft.values,
  };
}

function describeValue(
  field: FilterField,
  operator: FilterOperator,
  value: string,
) {
  if (field.type === "text") {
    return `“${value}”`;
  }

  if (field.type === "number") {
    return field.unit ? `${value} ${field.unit}` : value;
  }

  const option = getOptions(field).find((item) => item.value === value);
  const label = option?.label ?? value;

  if (field.type === "date" && operator !== "in_last") {
    return `${label} ago`;
  }

  return label;
}

/** Tests a single row value against a filter. Empty filters match everything. */
export function matchesFilter(
  filter: Filter,
  type: FilterFieldType,
  value: unknown,
  now = Date.now(),
) {
  const [target] = filter.values;

  if (target === undefined) {
    return true;
  }

  if (type === "select") {
    const rowValues = Array.isArray(value)
      ? value.map(String)
      : value == null
        ? []
        : [String(value)];
    const hit = rowValues.some((item) => filter.values.includes(item));

    return filter.operator === "is" || filter.operator === "is_any_of"
      ? hit
      : !hit;
  }

  if (type === "text") {
    const hit = String(value ?? "")
      .toLowerCase()
      .includes(target.toLowerCase());

    return filter.operator === "does_not_contain" ? !hit : hit;
  }

  if (type === "number") {
    const rowNumber = Number(value);
    const targetNumber = Number(target);

    if (filter.operator === "gt") {
      return rowNumber > targetNumber;
    }

    return filter.operator === "lt"
      ? rowNumber < targetNumber
      : rowNumber === targetNumber;
  }

  const time = value instanceof Date ? value.getTime() : Number(value);
  const boundary = now - Number(target) * DAY_MS;

  return filter.operator === "before" ? time < boundary : time >= boundary;
}

/** Applies every filter to a list of rows. */
export function filterItems<T>(
  items: readonly T[],
  filters: readonly Filter[],
  fields: readonly FilterField[],
  getValue: (item: T, field: string) => unknown,
  now = Date.now(),
) {
  const types = new Map(fields.map((field) => [field.key, field.type]));

  return items.filter((item) =>
    filters.every((filter) => {
      const type = types.get(filter.field);

      return type
        ? matchesFilter(filter, type, getValue(item, filter.field), now)
        : true;
    }),
  );
}

function getFocusableItems(root: HTMLElement) {
  return Array.from(
    root.querySelectorAll<HTMLElement>("[data-filter-item]"),
  ).filter((element) => !element.closest("[inert]"));
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest("input, textarea, select, [role='dialog']") !== null)
  );
}

function FilterQueryBuilderRoot({
  "aria-label": ariaLabel = "Filters",
  children,
  className,
  fields,
  filters,
  hotkey = "f",
  onFiltersChange,
  onFocus,
  onKeyDown,
  onPreviewChange,
  ...props
}: FilterQueryBuilderRootProps) {
  const shouldReduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLElement | null>(null);
  const focusRequestRef = useRef<FocusRequest | null>(null);
  const idCountRef = useRef(0);
  const openAddRef = useRef<() => void>(() => {});
  const onPreviewChangeRef = useRef(onPreviewChange);
  const idPrefix = useId();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [peek, setPeek] = useState<Peek | null>(null);
  const [ghostAnchor, setGhostAnchor] = useState<HTMLElement | null>(null);
  // The add popover follows the draft token. Keep the last element so the
  // popup doesn't jump back to the trigger while it animates out.
  const registerGhostAnchor = useCallback((element: HTMLElement | null) => {
    if (element) {
      setGhostAnchor(element);
    }
  }, []);
  const fieldMap = useMemo(
    () => new Map(fields.map((field) => [field.key, field])),
    [fields],
  );

  const previewFilters = useMemo(() => {
    const previewed = editor ? draftToFilter(editor.draft, peek) : null;

    if (!peek || !previewed || previewed.values.length === 0) {
      return null;
    }

    return upsertFilter(
      filters,
      normalizeFilter(previewed, fieldMap.get(previewed.field)),
    );
  }, [editor, fieldMap, filters, peek]);

  const tokens = useMemo(() => {
    const draftId = editor?.draft.id;
    const models: TokenModel[] = filters.map((filter) => {
      const display =
        editor && filter.id === draftId
          ? draftToFilter(editor.draft, peek)
          : null;

      if (!display) {
        return {
          filter,
          isGhost: false,
          pending: filter.values.length === 0,
          tentative: false,
        };
      }

      return {
        filter: normalizeFilter(display, fieldMap.get(display.field)),
        isGhost: false,
        pending:
          display.field !== filter.field || editor?.draft.values.length === 0,
        tentative: peek !== null,
      };
    });
    const ghost =
      editor?.target === "add" && !filters.some(({ id }) => id === draftId)
        ? draftToFilter(editor.draft, peek)
        : null;

    if (ghost) {
      models.push({
        filter: normalizeFilter(ghost, fieldMap.get(ghost.field)),
        isGhost: true,
        pending: true,
        tentative: peek !== null,
      });
    }

    return models;
  }, [editor, fieldMap, filters, peek]);

  useEffect(() => {
    onPreviewChangeRef.current = onPreviewChange;
  }, [onPreviewChange]);

  useEffect(() => {
    onPreviewChangeRef.current?.(previewFilters);
  }, [previewFilters]);

  // Keep a single tab stop inside the toolbar and honour focus requests made
  // before the DOM changed (e.g. after removing a token).
  useLayoutEffect(() => {
    const root = rootRef.current;

    if (!root) {
      return;
    }

    const request = focusRequestRef.current;
    focusRequestRef.current = null;

    if (request) {
      const selector =
        request === "add"
          ? "[data-filter-add]"
          : `[data-token-id="${CSS.escape(request.tokenId)}"] [data-segment="${request.segment}"]`;
      const target =
        root.querySelector<HTMLElement>(selector) ??
        root.querySelector<HTMLElement>("[data-filter-add]");

      target?.focus();
      activeItemRef.current = target;
    }

    const items = getFocusableItems(root);
    const active =
      activeItemRef.current && items.includes(activeItemRef.current)
        ? activeItemRef.current
        : items[0];

    for (const item of items) {
      item.tabIndex = item === active ? 0 : -1;
    }
  });

  function commit(next: Filter[]) {
    onFiltersChange(next);
  }

  function requestFocus(request: FocusRequest) {
    const root = rootRef.current;

    if (root?.contains(document.activeElement) || editor) {
      focusRequestRef.current = request;
    }
  }

  function removeFilter(filterId: string, segment: Segment = "remove") {
    const index = filters.findIndex(({ id }) => id === filterId);

    if (index === -1) {
      return;
    }

    const neighbor = filters[index - 1] ?? filters[index + 1];
    requestFocus(neighbor ? { segment, tokenId: neighbor.id } : "add");
    commit(filters.filter(({ id }) => id !== filterId));
  }

  function finish() {
    setEditor(null);
    setPeek(null);
  }

  function openAdd() {
    idCountRef.current += 1;
    setGhostAnchor(null);
    setPeek(null);
    setEditor({
      direction: 1,
      draft: {
        field: null,
        id: `${idPrefix}${Date.now().toString(36)}-${idCountRef.current}`,
        operator: null,
        values: [],
      },
      step: "field",
      target: "add",
    });
  }

  useEffect(() => {
    openAddRef.current = openAdd;
  });

  useEffect(() => {
    if (!hotkey) {
      return;
    }

    const key = hotkey.toLowerCase();

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.key.toLowerCase() !== key ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      openAddRef.current();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hotkey]);

  function openEdit(filterId: string, target: EditorTarget) {
    const filter = filters.find(({ id }) => id === filterId);

    if (!filter) {
      return;
    }

    setPeek(null);
    setEditor({
      direction: 1,
      draft: { ...filter, values: [...filter.values] },
      step: target === "add" ? "field" : target,
      target,
    });
  }

  function close(restoreFocus = true) {
    const applied = editor
      ? filters.find(({ id }) => id === editor.draft.id)
      : undefined;

    finish();

    if (applied && applied.values.length === 0) {
      const index = filters.indexOf(applied);
      const neighbor = filters[index - 1] ?? filters[index + 1];

      if (restoreFocus) {
        focusRequestRef.current = neighbor
          ? { segment: "value", tokenId: neighbor.id }
          : "add";
      }

      commit(filters.filter(({ id }) => id !== applied.id));
    }
  }

  function applyDraft(draft: Draft) {
    const filter = draftToFilter(draft);

    if (filter) {
      commit(
        upsertFilter(
          filters,
          normalizeFilter(filter, fieldMap.get(filter.field)),
        ),
      );
    }
  }

  function chooseField(key: string) {
    const field = fieldMap.get(key);

    if (!editor || !field) {
      return;
    }

    const original = filters.find(({ id }) => id === editor.draft.id);

    if (editor.target === "field" && original?.field === key) {
      finish();
      return;
    }

    const operators = getOperators(field);

    setPeek(null);
    setEditor({
      ...editor,
      direction: 1,
      draft: {
        field: key,
        id: editor.draft.id,
        operator: operators[0],
        values: [],
      },
      step: operators.length > 1 ? "operator" : "value",
    });
  }

  function chooseOperator(operator: FilterOperator) {
    if (!editor) {
      return;
    }

    const draft = { ...editor.draft, operator };
    const isApplied =
      draft.values.length > 0 &&
      filters.some(({ id, field }) => id === draft.id && field === draft.field);

    if (editor.target === "operator" || isApplied) {
      applyDraft(draft);
    }

    if (editor.target === "operator") {
      finish();
      return;
    }

    setPeek(null);
    setEditor({ ...editor, direction: 1, draft, step: "value" });
  }

  function pickValue(value: string) {
    if (!editor) {
      return;
    }

    applyDraft({ ...editor.draft, values: [value] });
    finish();
  }

  function toggleValue(value: string) {
    if (!editor) {
      return;
    }

    const { values } = editor.draft;
    const draft = {
      ...editor.draft,
      values: values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value],
    };
    const normalized = draftToFilter(draft);

    if (normalized) {
      draft.operator = normalizeFilter(
        normalized,
        fieldMap.get(normalized.field),
      ).operator;
    }

    applyDraft(draft);
    setPeek(null);
    setEditor({ ...editor, draft });
  }

  function goToStep(step: Step) {
    if (!editor || editor.step === step) {
      return;
    }

    const original = filters.find(({ id }) => id === editor.draft.id);
    const draft: Draft =
      step === "field"
        ? editor.target === "field" && original
          ? { ...original, values: [...original.values] }
          : { field: null, id: editor.draft.id, operator: null, values: [] }
        : editor.draft;

    setPeek(null);
    setEditor({ ...editor, direction: -1, draft, step });
  }

  function clear() {
    requestFocus("add");
    commit([]);
  }

  function handleFocus(event: FocusEvent<HTMLDivElement>) {
    onFocus?.(event);

    const target = event.target;

    if (target.hasAttribute("data-filter-item")) {
      activeItemRef.current = target;

      for (const item of getFocusableItems(event.currentTarget)) {
        item.tabIndex = item === target ? 0 : -1;
      }
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);

    const target = event.target as HTMLElement;

    if (
      event.defaultPrevented ||
      !event.currentTarget.contains(target) ||
      !target.hasAttribute("data-filter-item")
    ) {
      return;
    }

    const items = getFocusableItems(event.currentTarget);
    const index = items.indexOf(target);
    const moves: Record<string, number | undefined> = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      End: items.length - 1,
      Home: 0,
    };
    const nextIndex = moves[event.key];

    if (nextIndex !== undefined) {
      event.preventDefault();
      items[Math.max(0, Math.min(items.length - 1, nextIndex))]?.focus();
      return;
    }

    if (event.key !== "Backspace" && event.key !== "Delete") {
      return;
    }

    const tokenId =
      target.closest<HTMLElement>("[data-token-id]")?.dataset.tokenId;

    if (tokenId) {
      event.preventDefault();
      removeFilter(tokenId, (target.dataset.segment as Segment) ?? "remove");
      return;
    }

    if (target.hasAttribute("data-filter-add") && event.key === "Backspace") {
      event.preventDefault();
      items[index - 1]?.focus();
    }
  }

  const context: FilterQueryBuilderContextValue = {
    chooseField,
    chooseOperator,
    clear,
    close,
    editor,
    fieldMap,
    fields,
    filters,
    ghostAnchor,
    goToStep,
    hotkey,
    openAdd,
    openEdit,
    pickValue,
    registerGhostAnchor,
    removeFilter,
    setPeek,
    shouldMove: !shouldReduceMotion,
    toggleValue,
    tokens,
  };

  return (
    <FilterQueryBuilderContext.Provider value={context}>
      <div
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        className={cn("flex items-start gap-2", className)}
        data-previewing={previewFilters ? "" : undefined}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        ref={rootRef}
        role="toolbar"
        {...props}
      >
        {children}
      </div>
    </FilterQueryBuilderContext.Provider>
  );
}

function FilterQueryBuilderList({
  children,
  className,
  ...props
}: FilterQueryBuilderListProps) {
  const { tokens } = useFilterQueryBuilder("FilterQueryBuilder.List");

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-wrap items-center gap-y-1.5",
        className,
      )}
      {...props}
    >
      <AnimatePresence initial={false}>
        {tokens.map((token) => (
          <FilterToken key={token.filter.id} token={token} />
        ))}
      </AnimatePresence>
      {children}
    </div>
  );
}

function AnimatedWidth({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { shouldMove } = useFilterQueryBuilder("FilterQueryBuilder.List");
  const contentRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number | "auto">("auto");

  useLayoutEffect(() => {
    const content = contentRef.current;

    if (!content) {
      return;
    }

    const measure = () => setWidth(content.getBoundingClientRect().width);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.span
      animate={{ width }}
      className={cn(
        "relative flex h-full items-center overflow-hidden",
        className,
      )}
      initial={false}
      transition={shouldMove ? sizeSpring : instant}
    >
      <span
        className="relative flex shrink-0 items-center gap-1.5 whitespace-nowrap"
        ref={contentRef}
      >
        {children}
      </span>
    </motion.span>
  );
}

function AnimatedHeight({ children }: { children: ReactNode }) {
  const { shouldMove } = useFilterQueryBuilder("FilterQueryBuilder.Add");
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");

  useLayoutEffect(() => {
    const content = contentRef.current;

    if (!content) {
      return;
    }

    const measure = () => setHeight(content.getBoundingClientRect().height);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      animate={{ height }}
      className="overflow-hidden"
      initial={false}
      transition={shouldMove ? { ...sizeSpring, duration: 0.28 } : instant}
    >
      <div className="relative" ref={contentRef}>
        {children}
      </div>
    </motion.div>
  );
}

function FilterToken({ token }: { token: TokenModel }) {
  const { editor, fieldMap, registerGhostAnchor, removeFilter, shouldMove } =
    useFilterQueryBuilder("FilterQueryBuilder.List");
  const isPresent = useIsPresent();
  const [settleCount, setSettleCount] = useState(0);
  const wasPendingRef = useRef(token.pending);
  const { filter, isGhost, pending, tentative } = token;
  const field = fieldMap.get(filter.field);
  const isAddDraft = editor?.target === "add" && editor.draft.id === filter.id;

  useEffect(() => {
    if (wasPendingRef.current && !pending) {
      setSettleCount((count) => count + 1);
    }

    wasPendingRef.current = pending;
  }, [pending]);

  if (!field) {
    return null;
  }

  const operator = operatorCopy[filter.operator];
  const summary =
    filter.values.length === 0
      ? "no value"
      : filter.values
          .map((value) => describeValue(field, filter.operator, value))
          .join(", ");

  return (
    <motion.div
      animate={{ opacity: 1, width: "auto" }}
      className="flex shrink-0 overflow-hidden"
      exit={{ opacity: 0, width: shouldMove ? 0 : "auto" }}
      initial={{ opacity: 0, width: shouldMove ? 0 : "auto" }}
      transition={
        shouldMove
          ? { opacity: { duration: 0.18, ease: easeOut }, width: sizeSpring }
          : { duration: 0.12 }
      }
    >
      <div className="flex shrink-0 pr-1.5">
        {/* biome-ignore lint/a11y/useSemanticElements: A token is a labelled cluster of buttons, not a form fieldset. */}
        <div
          aria-label={`${field.label} ${operator.label} ${summary}`}
          className={cn(
            "relative isolate flex h-7 items-stretch overflow-hidden rounded-lg bg-[var(--token-bg)] text-xs transition-[background-color,box-shadow] duration-200 [--token-bg:var(--color-grayscale-1)] dark:[--token-bg:var(--color-grayscale-3)]",
            pending
              ? "bg-grayscale-2/70 dark:bg-grayscale-3/50"
              : "shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none",
          )}
          data-pending={pending ? "" : undefined}
          data-token-id={filter.id}
          inert={isGhost || !isPresent}
          ref={isAddDraft ? registerGhostAnchor : undefined}
          role="group"
        >
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 z-10 rounded-[inherit] border border-grayscale-4 transition-opacity duration-200 dark:border-grayscale-5",
              pending ? "opacity-0" : "opacity-100",
            )}
          />
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 z-10 rounded-[inherit] border border-grayscale-7 border-dashed transition-opacity duration-200",
              pending ? "opacity-100" : "opacity-0",
            )}
          />
          {shouldMove && settleCount > 0 ? (
            <motion.span
              animate={{ opacity: [0, 1, 0], x: ["-100%", "100%"] }}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-20 bg-[linear-gradient(100deg,transparent_20%,color-mix(in_oklab,var(--color-grayscale-12)_7%,transparent)_50%,transparent_80%)]"
              key={settleCount}
              transition={{ duration: 0.6, ease: easeOut }}
            />
          ) : null}

          <SegmentPopover
            className="rounded-l-lg pr-1.5 pl-2 text-grayscale-11"
            filterId={filter.id}
            label={`Change field, currently ${field.label}`}
            segment="field"
          >
            <AnimatedWidth>
              {field.icon ? (
                <span
                  aria-hidden="true"
                  className="flex size-3.5 items-center justify-center text-grayscale-10"
                >
                  {field.icon}
                </span>
              ) : null}
              <SwapText value={field.label} />
            </AnimatedWidth>
          </SegmentPopover>

          <SegmentPopover
            className="border-grayscale-3 border-l px-1.5 text-grayscale-10 dark:border-grayscale-5"
            filterId={filter.id}
            label={`Change operator, currently ${operator.label}`}
            segment="operator"
          >
            <AnimatedWidth>
              <SwapText value={operator.symbol ?? operator.label} />
            </AnimatedWidth>
          </SegmentPopover>

          <SegmentPopover
            className={cn(
              "border-grayscale-3 border-l px-2 font-medium transition-colors dark:border-grayscale-5",
              tentative || pending ? "text-grayscale-10" : "text-grayscale-12",
            )}
            filterId={filter.id}
            label={`Change value, currently ${summary}`}
            segment="value"
          >
            <AnimatedWidth>
              <ValueSummary field={field} filter={filter} />
            </AnimatedWidth>
          </SegmentPopover>

          <button
            aria-label={`Remove ${field.label} filter`}
            className={cn(
              segmentClassName,
              "rounded-r-lg border-grayscale-3 border-l px-1.5 text-grayscale-9 hover:text-grayscale-12 dark:border-grayscale-5",
            )}
            data-filter-item=""
            data-segment="remove"
            onClick={() => removeFilter(filter.id)}
            type="button"
          >
            <XIcon aria-hidden="true" size={12} weight="bold" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function SwapText({ value }: { value: string }) {
  const { shouldMove } = useFilterQueryBuilder("FilterQueryBuilder.List");

  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.span
        animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
        className="block truncate"
        exit={{
          filter: shouldMove ? "blur(2px)" : "blur(0px)",
          opacity: 0,
          y: shouldMove ? -6 : 0,
        }}
        initial={{
          filter: shouldMove ? "blur(2px)" : "blur(0px)",
          opacity: 0,
          y: shouldMove ? 6 : 0,
        }}
        key={value}
        transition={{ duration: shouldMove ? 0.2 : 0.12, ease: easeOut }}
      >
        {value}
      </motion.span>
    </AnimatePresence>
  );
}

function ValueSummary({
  field,
  filter,
}: {
  field: FilterField;
  filter: Filter;
}) {
  const { shouldMove } = useFilterQueryBuilder("FilterQueryBuilder.List");
  const options = getOptions(field);
  const selected = filter.values.map((value) => ({
    label: describeValue(field, filter.operator, value),
    option: options.find((option) => option.value === value),
    value,
  }));
  const icons = selected.filter(({ option }) => option?.icon).slice(0, 3);
  const joined = selected.map(({ label }) => label).join(", ");
  const collapsed =
    selected.length > 2 || (selected.length === 2 && joined.length > 22);
  const noun = field.pluralLabel ?? `${field.label.toLowerCase()}s`;

  return (
    <>
      {icons.length > 0 ? (
        <span aria-hidden="true" className="flex items-center">
          <AnimatePresence initial={false} mode="popLayout">
            {icons.map(({ option, value }, index) => (
              <motion.span
                animate={{ opacity: 1, scale: 1 }}
                className={cn(
                  "relative flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--token-bg)] ring-2 ring-[var(--token-bg)]",
                  index > 0 && "-ml-1",
                )}
                exit={{ opacity: 0, scale: shouldMove ? 0.5 : 1 }}
                initial={{ opacity: 0, scale: shouldMove ? 0.5 : 1 }}
                key={value}
                style={{ zIndex: icons.length - index }}
                transition={{ duration: 0.2, ease: easeOut }}
              >
                {option?.icon}
              </motion.span>
            ))}
          </AnimatePresence>
        </span>
      ) : null}
      {selected.length === 0 ? (
        <span className="text-grayscale-8">Select…</span>
      ) : (
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            animate={{ opacity: 1, y: 0 }}
            className="flex max-w-44 items-center truncate"
            exit={{ opacity: 0, y: shouldMove ? -6 : 0 }}
            initial={{ opacity: 0, y: shouldMove ? 6 : 0 }}
            key={collapsed ? "count" : joined}
            transition={{ duration: shouldMove ? 0.2 : 0.12, ease: easeOut }}
          >
            {collapsed ? (
              <>
                <NumberFlow
                  animated={shouldMove}
                  className="tabular-nums"
                  value={selected.length}
                />
                <span className="ml-1">{noun}</span>
              </>
            ) : (
              <span className="truncate">{joined}</span>
            )}
          </motion.span>
        </AnimatePresence>
      )}
    </>
  );
}

function SegmentPopover({
  children,
  className,
  filterId,
  label,
  segment,
}: {
  children: ReactNode;
  className?: string;
  filterId: string;
  label: string;
  segment: EditorTarget;
}) {
  const { close, editor, openEdit } = useFilterQueryBuilder(
    "FilterQueryBuilder.List",
  );
  const open = editor?.draft.id === filterId && editor.target === segment;

  return (
    <Popover.Root
      onOpenChange={(nextOpen, details) => {
        if (nextOpen) {
          openEdit(filterId, segment);
        } else {
          close(details.reason !== "outside-press");
        }
      }}
      open={open}
    >
      <Popover.Trigger
        aria-label={label}
        className={cn(segmentClassName, className)}
        data-filter-item=""
        data-segment={segment}
      >
        {children}
      </Popover.Trigger>
      <EditorPopup />
    </Popover.Root>
  );
}

function FilterQueryBuilderAdd({
  children = "Filter",
  className,
}: FilterQueryBuilderAddProps) {
  const { close, editor, ghostAnchor, hotkey, openAdd } = useFilterQueryBuilder(
    "FilterQueryBuilder.Add",
  );

  return (
    <Popover.Root
      onOpenChange={(nextOpen, details) => {
        if (nextOpen) {
          openAdd();
        } else {
          close(details.reason !== "outside-press");
        }
      }}
      open={editor?.target === "add"}
    >
      <Popover.Trigger
        aria-keyshortcuts={hotkey ?? undefined}
        className={cn(
          "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-grayscale-3 bg-grayscale-1 pr-1 pl-2 font-medium text-grayscale-11 text-xs outline-none transition-[background-color,border-color,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:border-grayscale-4 hover:bg-grayscale-2 focus-visible:ring-2 focus-visible:ring-grayscale-7 active:scale-[0.97] data-[popup-open]:border-grayscale-5 data-[popup-open]:bg-grayscale-2 dark:border-grayscale-4 dark:bg-grayscale-3 dark:data-[popup-open]:bg-grayscale-4 dark:hover:border-grayscale-5 dark:hover:bg-grayscale-4",
          !hotkey && "pr-2",
          className,
        )}
        data-filter-add=""
        data-filter-item=""
      >
        <PlusIcon
          aria-hidden="true"
          className="text-grayscale-10"
          size={12}
          weight="bold"
        />
        {children}
        {hotkey ? (
          <Kbd aria-hidden className="ml-0.5">
            {hotkey.toUpperCase()}
          </Kbd>
        ) : null}
      </Popover.Trigger>
      <EditorPopup anchor={ghostAnchor} />
    </Popover.Root>
  );
}

function FilterQueryBuilderClear({
  children = "Clear",
  className,
}: FilterQueryBuilderClearProps) {
  const { clear, filters, shouldMove } = useFilterQueryBuilder(
    "FilterQueryBuilder.Clear",
  );

  return (
    <AnimatePresence initial={false}>
      {filters.length > 0 ? (
        <motion.button
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            "flex h-7 shrink-0 cursor-pointer items-center rounded-lg px-2 font-medium text-grayscale-10 text-xs outline-none transition-colors duration-150 hover:bg-grayscale-3 hover:text-grayscale-12 focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:hover:bg-grayscale-4",
            className,
          )}
          data-filter-item=""
          exit={{ opacity: 0, scale: shouldMove ? 0.96 : 1 }}
          initial={{ opacity: 0, scale: shouldMove ? 0.96 : 1 }}
          onClick={clear}
          transition={{ duration: 0.15, ease: easeOut }}
          type="button"
        >
          {children}
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}

function Kbd({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"kbd">) {
  return (
    <kbd
      {...props}
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded border border-grayscale-4 bg-grayscale-2 px-1 font-medium font-sans text-[10px] text-grayscale-10 leading-none dark:border-grayscale-6 dark:bg-grayscale-4",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

type KeyName = "arrows" | "backspace" | "enter" | "space";

function KeyHint({ name }: { name: KeyName }) {
  if (name === "space") {
    return <Kbd>Space</Kbd>;
  }

  if (name === "arrows") {
    return (
      <span className="flex gap-0.5">
        <Kbd aria-label="Up">
          <ArrowUpIcon aria-hidden="true" size={9} weight="bold" />
        </Kbd>
        <Kbd aria-label="Down">
          <ArrowDownIcon aria-hidden="true" size={9} weight="bold" />
        </Kbd>
      </span>
    );
  }

  const Icon = name === "enter" ? KeyReturnIcon : BackspaceIcon;

  return (
    <Kbd aria-label={name === "enter" ? "Enter" : "Backspace"}>
      <Icon aria-hidden="true" size={10} weight="bold" />
    </Kbd>
  );
}

function EditorPopup({ anchor }: { anchor?: HTMLElement | null }) {
  const { editor } = useFilterQueryBuilder("FilterQueryBuilder");
  const lastEditorRef = useRef(editor);

  // Freeze the content while the popup plays its exit transition.
  if (editor) {
    lastEditorRef.current = editor;
  }

  const shown = editor ?? lastEditorRef.current;

  return (
    <Popover.Portal>
      <Popover.Positioner
        align="start"
        anchor={anchor ?? undefined}
        className="z-50 outline-none"
        collisionPadding={8}
        side="bottom"
        sideOffset={6}
      >
        <Popover.Popup className={popupClassName}>
          {shown ? (
            <EditorContent editor={shown} live={editor !== null} />
          ) : null}
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  );
}

const stepVariants = {
  enter: ({
    direction,
    shouldMove,
  }: {
    direction: number;
    shouldMove: boolean;
  }) => ({
    filter: shouldMove ? "blur(2px)" : "blur(0px)",
    opacity: 0,
    x: shouldMove ? direction * 16 : 0,
  }),
  exit: ({
    direction,
    shouldMove,
  }: {
    direction: number;
    shouldMove: boolean;
  }) => ({
    filter: shouldMove ? "blur(2px)" : "blur(0px)",
    opacity: 0,
    x: shouldMove ? direction * -16 : 0,
  }),
  visible: { filter: "blur(0px)", opacity: 1, x: 0 },
};

function EditorContent({ editor, live }: { editor: Editor; live: boolean }) {
  const { fieldMap, goToStep, shouldMove } =
    useFilterQueryBuilder("FilterQueryBuilder");
  const field = editor.draft.field
    ? fieldMap.get(editor.draft.field)
    : undefined;
  const isFlow = editor.target === "add" || editor.target === "field";
  const custom = { direction: editor.direction, shouldMove };
  let body: ReactNode = null;

  if (editor.step === "field") {
    body = <FieldStep editor={editor} live={live} />;
  } else if (field && editor.step === "operator") {
    body = <OperatorStep editor={editor} field={field} live={live} />;
  } else if (field) {
    body = <ValueStep editor={editor} field={field} live={live} />;
  }

  return (
    <AnimatedHeight>
      {isFlow && field && editor.step !== "field" ? (
        <div className="flex items-center gap-1 px-2 pt-2 text-[11px]">
          <button
            className="flex h-5 cursor-pointer items-center gap-1 rounded-md bg-grayscale-3 px-1.5 font-medium text-grayscale-11 transition-colors hover:bg-grayscale-4 hover:text-grayscale-12 dark:bg-grayscale-5 dark:hover:bg-grayscale-6"
            onClick={() => goToStep("field")}
            tabIndex={-1}
            type="button"
          >
            {field.icon ? (
              <span
                aria-hidden="true"
                className="flex size-3 items-center justify-center text-grayscale-10 [&>svg]:size-3"
              >
                {field.icon}
              </span>
            ) : null}
            {field.label}
          </button>
          {editor.step === "value" && editor.draft.operator ? (
            <>
              <CaretRightIcon
                aria-hidden="true"
                className="text-grayscale-8"
                size={10}
                weight="bold"
              />
              <button
                className="flex h-5 cursor-pointer items-center rounded-md bg-grayscale-3 px-1.5 font-medium text-grayscale-11 transition-colors hover:bg-grayscale-4 hover:text-grayscale-12 dark:bg-grayscale-5 dark:hover:bg-grayscale-6"
                onClick={() => goToStep("operator")}
                tabIndex={-1}
                type="button"
              >
                {operatorCopy[editor.draft.operator].label}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      <AnimatePresence custom={custom} initial={false} mode="popLayout">
        <motion.div
          animate="visible"
          custom={custom}
          exit="exit"
          initial="enter"
          key={`${editor.step}-${editor.draft.field ?? "none"}`}
          transition={{ duration: shouldMove ? 0.22 : 0.12, ease: easeOut }}
          variants={stepVariants}
        >
          {body}
        </motion.div>
      </AnimatePresence>
    </AnimatedHeight>
  );
}

function FieldStep({ editor, live }: { editor: Editor; live: boolean }) {
  const { chooseField, fields, filters } =
    useFilterQueryBuilder("FilterQueryBuilder");
  const current =
    editor.target === "field"
      ? filters.find(({ id }) => id === editor.draft.id)?.field
      : undefined;

  return (
    <CommandMenu
      hints={[
        ["arrows", "Navigate"],
        ["enter", "Select"],
      ]}
      initialValue={current}
      items={fields.map((field) => ({
        checked: field.key === current,
        icon: field.icon,
        label: field.label,
        meta:
          field.key === current ? undefined : (
            <CaretRightIcon
              aria-hidden="true"
              className="text-grayscale-8"
              size={11}
              weight="bold"
            />
          ),
        value: field.key,
      }))}
      label="Filter by field"
      live={live}
      onSelect={(item) => chooseField(item.value)}
      placeholder="Filter by…"
    />
  );
}

function OperatorStep({
  editor,
  field,
  live,
}: {
  editor: Editor;
  field: FilterField;
  live: boolean;
}) {
  const { chooseOperator, goToStep, setPeek } =
    useFilterQueryBuilder("FilterQueryBuilder");
  const isFlow = editor.target !== "operator";
  const current = editor.draft.operator;

  return (
    <CommandMenu
      hints={[
        ["enter", "Select"],
        ...(isFlow ? ([["backspace", "Back"]] as const) : []),
      ]}
      initialValue={current ?? undefined}
      items={getOperators(field).map((operator) => ({
        checked: !isFlow && operator === current,
        icon: operatorCopy[operator].symbol ? (
          <span className="font-mono font-semibold text-[11px] text-grayscale-10">
            {operatorCopy[operator].symbol}
          </span>
        ) : undefined,
        label: operatorCopy[operator].label,
        value: operator,
      }))}
      label={`${field.label} operator`}
      live={live}
      onBack={isFlow ? () => goToStep("field") : undefined}
      onHighlight={
        isFlow
          ? undefined
          : (value) =>
              setPeek(
                value && value !== current
                  ? { operator: value as FilterOperator }
                  : null,
              )
      }
      onSelect={(item) => chooseOperator(item.value as FilterOperator)}
      placeholder={`${field.label} ${isFlow ? "…" : "operator…"}`}
    />
  );
}

function ValueStep({
  editor,
  field,
  live,
}: {
  editor: Editor;
  field: FilterField;
  live: boolean;
}) {
  const { goToStep, pickValue, setPeek, toggleValue } =
    useFilterQueryBuilder("FilterQueryBuilder");
  const isFlow = editor.target === "add" || editor.target === "field";
  const operator = editor.draft.operator ?? getOperators(field)[0];
  const { values } = editor.draft;
  const onBack = isFlow
    ? () => goToStep(getOperators(field).length > 1 ? "operator" : "field")
    : undefined;
  const noun = field.pluralLabel ?? `${field.label.toLowerCase()}s`;

  if (field.type === "text" || field.type === "number") {
    return (
      <ValueInput
        field={field}
        initialValue={values[0] ?? ""}
        live={live}
        onBack={onBack}
        operator={operator}
        showOperator={!isFlow}
      />
    );
  }

  const isSelect = field.type === "select";

  return (
    <CommandMenu
      checkable={isSelect}
      hints={
        isSelect
          ? [
              ["enter", values.length > 0 ? "Toggle" : "Apply"],
              ["space", "Multi-select"],
            ]
          : [
              ["arrows", "Preview"],
              ["enter", "Apply"],
            ]
      }
      initialValue={values[0]}
      items={getOptions(field).map((option) => ({
        checked: values.includes(option.value),
        icon: option.icon,
        keywords: option.keywords,
        label: describeValue(field, operator, option.value),
        meta:
          option.count === undefined ? undefined : (
            <span className="text-[11px] text-grayscale-9 tabular-nums">
              {option.count}
            </span>
          ),
        value: option.value,
      }))}
      label={`${field.label} values`}
      live={live}
      onBack={onBack}
      onHighlight={(value) =>
        setPeek(
          value && (!isSelect || values.length === 0)
            ? { values: [value] }
            : null,
        )
      }
      onSelect={(item, event) => {
        const wantsMany =
          isSelect &&
          (values.length > 0 ||
            isMultiOperator(operator) ||
            event.shiftKey ||
            event.metaKey ||
            event.ctrlKey);

        if (wantsMany) {
          toggleValue(item.value);
        } else {
          pickValue(item.value);
        }
      }}
      onToggle={isSelect ? (item) => toggleValue(item.value) : undefined}
      placeholder={
        isSelect
          ? `Search ${noun}…`
          : `${field.label} ${operatorCopy[operator].label}…`
      }
    />
  );
}

function ValueInput({
  field,
  initialValue,
  live,
  onBack,
  operator,
  showOperator,
}: {
  field: FilterField;
  initialValue: string;
  live: boolean;
  showOperator: boolean;
  onBack?: () => void;
  operator: FilterOperator;
}) {
  const { pickValue, setPeek } = useFilterQueryBuilder("FilterQueryBuilder");
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(initialValue);
  const isNumber = field.type === "number";
  const trimmed = text.trim();
  const isValid = isNumber ? numberPattern.test(trimmed) : trimmed.length > 0;
  const copy = operatorCopy[operator];

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!live) {
      return;
    }

    if (event.key === "Enter" && isValid) {
      event.preventDefault();
      pickValue(trimmed);
    } else if (event.key === "Backspace" && text === "" && onBack) {
      event.preventDefault();
      onBack();
    }
  }

  return (
    <div>
      <label className="flex h-10 items-center gap-2 border-grayscale-3 border-b px-3 dark:border-grayscale-5">
        {showOperator || copy.symbol ? (
          <span className="shrink-0 font-medium text-grayscale-10 text-xs">
            {copy.symbol ?? copy.label}
          </span>
        ) : null}
        <input
          aria-label={`${field.label} ${copy.label}`}
          className="min-w-0 flex-1 bg-transparent text-grayscale-12 text-sm outline-none placeholder:text-grayscale-8"
          inputMode={isNumber ? "decimal" : "text"}
          onChange={(event) => {
            const next = event.target.value;
            const nextTrimmed = next.trim();
            const nextValid = isNumber
              ? numberPattern.test(nextTrimmed)
              : nextTrimmed.length > 0;

            setText(next);
            setPeek(nextValid ? { values: [nextTrimmed] } : null);
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            isNumber ? "0" : `Type to match ${field.label.toLowerCase()}…`
          }
          ref={inputRef}
          value={text}
        />
        {field.unit ? (
          <span className="shrink-0 text-grayscale-9 text-xs">
            {field.unit}
          </span>
        ) : null}
      </label>
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] text-grayscale-9">
        <span>
          {isValid
            ? "Previewing live"
            : isNumber
              ? "Enter a number"
              : "Start typing to preview"}
        </span>
        <span
          className={cn(
            "flex items-center gap-1.5 transition-opacity duration-150",
            isValid ? "opacity-100" : "opacity-40",
          )}
        >
          <KeyHint name="enter" /> Apply
        </span>
      </div>
    </div>
  );
}

type MenuItem = {
  checked?: boolean;
  icon?: ReactNode;
  keywords?: readonly string[];
  label: string;
  meta?: ReactNode;
  value: string;
};

function filterMenuItems(items: readonly MenuItem[], query: string) {
  const needle = query.trim().toLowerCase();

  if (!needle) {
    return items;
  }

  const matches = items.filter((item) =>
    [item.label, ...(item.keywords ?? [])].some((text) =>
      text.toLowerCase().includes(needle),
    ),
  );

  return [
    ...matches.filter((item) => item.label.toLowerCase().startsWith(needle)),
    ...matches.filter((item) => !item.label.toLowerCase().startsWith(needle)),
  ];
}

function CommandMenu({
  checkable = false,
  hints,
  initialValue,
  items,
  label,
  live,
  onBack,
  onHighlight,
  onSelect,
  onToggle,
  placeholder,
}: {
  checkable?: boolean;
  hints: readonly (readonly [KeyName, string])[];
  initialValue?: string;
  items: readonly MenuItem[];
  label: string;
  live: boolean;
  onBack?: () => void;
  onHighlight?: (value: string | null) => void;
  onSelect: (
    item: MenuItem,
    event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean },
  ) => void;
  onToggle?: (item: MenuItem) => void;
  placeholder: string;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const onHighlightRef = useRef(onHighlight);
  const [query, setQuery] = useState("");
  const [activeValue, setActiveValue] = useState(
    initialValue ?? items[0]?.value ?? null,
  );
  const visible = filterMenuItems(items, query);
  const activeIndex = Math.max(
    0,
    visible.findIndex((item) => item.value === activeValue),
  );
  const active = visible[activeIndex] ?? null;
  const highlighted = live ? (active?.value ?? null) : null;

  useEffect(() => {
    onHighlightRef.current = onHighlight;
  }, [onHighlight]);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (highlighted !== null || live) {
      onHighlightRef.current?.(highlighted);
    }
  }, [highlighted, live]);

  useEffect(() => {
    if (!highlighted) {
      return;
    }

    listRef.current
      ?.querySelector(`[data-value="${CSS.escape(highlighted)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  function move(offset: number) {
    if (visible.length === 0) {
      return;
    }

    const next = (activeIndex + offset + visible.length) % visible.length;
    setActiveValue(visible[next].value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!live) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" && active) {
      event.preventDefault();
      onSelect(active, event);
    } else if (event.key === " " && onToggle && query === "" && active) {
      event.preventDefault();
      onToggle(active);
    } else if (event.key === "Backspace" && query === "" && onBack) {
      event.preventDefault();
      onBack();
    }
  }

  function handleItemClick(event: MouseEvent<HTMLDivElement>, item: MenuItem) {
    if (!live) {
      return;
    }

    const target = event.target as HTMLElement;

    if (onToggle && target.closest("[data-menu-checkbox]")) {
      onToggle(item);
    } else {
      onSelect(item, event);
    }
  }

  return (
    <div>
      <div className="flex h-10 items-center border-grayscale-3 border-b px-3 dark:border-grayscale-5">
        <input
          aria-activedescendant={
            active ? `${listId}-${activeIndex}` : undefined
          }
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded="true"
          aria-label={label}
          className="min-w-0 flex-1 bg-transparent text-grayscale-12 text-sm outline-none placeholder:text-grayscale-8"
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setActiveValue(filterMenuItems(items, nextQuery)[0]?.value ?? null);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          ref={inputRef}
          role="combobox"
          value={query}
        />
      </div>
      <div
        aria-label={label}
        aria-multiselectable={checkable || undefined}
        className="max-h-64 scroll-py-1 overflow-y-auto p-1"
        id={listId}
        onMouseDown={(event) => event.preventDefault()}
        ref={listRef}
        role="listbox"
        tabIndex={-1}
      >
        {visible.length === 0 ? (
          <div className="px-2 py-5 text-center text-grayscale-9 text-xs">
            No matches for “{query.trim()}”
          </div>
        ) : (
          visible.map((item, index) => {
            const isActive = index === activeIndex;

            return (
              // biome-ignore lint/a11y/useKeyWithClickEvents: Keyboard selection runs through the combobox input via aria-activedescendant.
              <div
                aria-selected={checkable ? Boolean(item.checked) : isActive}
                className={cn(
                  "flex h-8 cursor-pointer select-none items-center gap-2 rounded-md px-2 text-[13px] text-grayscale-11",
                  isActive &&
                    "bg-grayscale-3 text-grayscale-12 dark:bg-grayscale-5",
                )}
                data-value={item.value}
                id={`${listId}-${index}`}
                key={item.value}
                onClick={(event) => handleItemClick(event, item)}
                onPointerMove={() => {
                  if (item.value !== activeValue) {
                    setActiveValue(item.value);
                  }
                }}
                role="option"
                tabIndex={-1}
              >
                {checkable ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border transition-[background-color,border-color,opacity] duration-150",
                      item.checked
                        ? "border-grayscale-12 bg-grayscale-12 text-grayscale-1 dark:border-grayscale-12"
                        : "border-grayscale-7 opacity-60",
                      isActive && "opacity-100",
                    )}
                    data-menu-checkbox=""
                  >
                    {item.checked ? <CheckIcon size={9} weight="bold" /> : null}
                  </span>
                ) : null}
                {item.icon ? (
                  <span
                    aria-hidden="true"
                    className="flex size-4 shrink-0 items-center justify-center text-grayscale-10"
                  >
                    {item.icon}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.meta}
                {!checkable && item.checked ? (
                  <CheckIcon
                    aria-hidden="true"
                    className="shrink-0 text-grayscale-11"
                    size={12}
                    weight="bold"
                  />
                ) : null}
              </div>
            );
          })
        )}
      </div>
      <div className="flex items-center gap-3 border-grayscale-3 border-t px-3 py-2 text-[11px] text-grayscale-9 dark:border-grayscale-5">
        {hints.map(([key, hint]) => (
          <span className="flex items-center gap-1.5" key={hint}>
            <KeyHint name={key} />
            {hint}
          </span>
        ))}
      </div>
    </div>
  );
}

export const FilterQueryBuilder = {
  Add: FilterQueryBuilderAdd,
  Clear: FilterQueryBuilderClear,
  List: FilterQueryBuilderList,
  Root: FilterQueryBuilderRoot,
};
