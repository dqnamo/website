export const usageSource = `import { CircleDashedIcon, TextAaIcon } from "@phosphor-icons/react";
import { useState } from "react";
import {
  type Filter,
  type FilterField,
  FilterQueryBuilder,
  filterItems,
} from "@/components/FilterQueryBuilder";

const fields: FilterField[] = [
  {
    key: "status",
    label: "Status",
    type: "select",
    icon: <CircleDashedIcon size={14} weight="bold" />,
    pluralLabel: "statuses",
    options: [
      { value: "todo", label: "Todo" },
      { value: "in_progress", label: "In Progress" },
      { value: "done", label: "Done" },
    ],
  },
  {
    key: "title",
    label: "Title",
    type: "text",
    icon: <TextAaIcon size={14} weight="bold" />,
  },
  { key: "estimate", label: "Estimate", type: "number", unit: "pts" },
  { key: "created", label: "Created", type: "date" },
];

export function IssuesView({ issues }: { issues: Issue[] }) {
  const [filters, setFilters] = useState<Filter[]>([]);
  const [preview, setPreview] = useState<Filter[] | null>(null);

  // Rows that match the highlighted option while the menu is open.
  const visible = filterItems(
    issues,
    preview ?? filters,
    fields,
    (issue, field) => issue[field as keyof Issue],
  );

  return (
    <>
      <FilterQueryBuilder.Root
        fields={fields}
        filters={filters}
        onFiltersChange={setFilters}
        onPreviewChange={setPreview}
      >
        <FilterQueryBuilder.List>
          <FilterQueryBuilder.Add />
        </FilterQueryBuilder.List>
        <FilterQueryBuilder.Clear />
      </FilterQueryBuilder.Root>

      <IssueList issues={visible} />
    </>
  );
}`;
