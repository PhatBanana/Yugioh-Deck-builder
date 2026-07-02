"use client";

export interface FilterValues {
  types: string[];
  races: string[];
  attributes: string[];
  archetypes: string[];
}

export interface CardFiltersState {
  q: string;
  type: string;
  race: string;
  attribute: string;
  archetype: string;
  ownedOnly: boolean;
  sort: string;
}

const SORT_OPTIONS = [
  { value: "name", label: "Name (A–Z)" },
  { value: "atk", label: "ATK (high first)" },
  { value: "def", label: "DEF (high first)" },
  { value: "level", label: "Level/Rank (high first)" },
  { value: "price", label: "Price (high first)" },
];

interface CardFiltersProps {
  values: CardFiltersState;
  onChange: (values: CardFiltersState) => void;
  filterOptions: FilterValues | null;
}

export default function CardFilters({ values, onChange, filterOptions }: CardFiltersProps) {
  function set<K extends keyof CardFiltersState>(key: K, value: CardFiltersState[K]) {
    onChange({ ...values, [key]: value });
  }

  const selectClass =
    "bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-sm text-neutral-200";

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <input
        type="text"
        placeholder="Search card name..."
        value={values.q}
        onChange={(e) => set("q", e.target.value)}
        className="flex-1 min-w-[200px] bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-500"
      />
      <select
        className={selectClass}
        value={values.type}
        onChange={(e) => set("type", e.target.value)}
      >
        <option value="">All Types</option>
        {filterOptions?.types.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <select
        className={selectClass}
        value={values.race}
        onChange={(e) => set("race", e.target.value)}
      >
        <option value="">All Races</option>
        {filterOptions?.races.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <select
        className={selectClass}
        value={values.attribute}
        onChange={(e) => set("attribute", e.target.value)}
      >
        <option value="">All Attributes</option>
        {filterOptions?.attributes.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <select
        className={selectClass}
        value={values.archetype}
        onChange={(e) => set("archetype", e.target.value)}
      >
        <option value="">All Archetypes</option>
        {filterOptions?.archetypes.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <select
        className={selectClass}
        value={values.sort}
        onChange={(e) => set("sort", e.target.value)}
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5 text-sm text-neutral-300">
        <input
          type="checkbox"
          checked={values.ownedOnly}
          onChange={(e) => set("ownedOnly", e.target.checked)}
        />
        Owned only
      </label>
    </div>
  );
}
