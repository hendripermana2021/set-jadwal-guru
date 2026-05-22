"use client";

import { useMemo, useState } from "react";

type SearchableOption = {
  id: string;
  name: string;
  disabled?: boolean;
  statusLabel?: string;
};

type SearchableSelectProps = {
  value: string;
  onChange: (id: string) => void;
  options: SearchableOption[];
  placeholder: string;
  emptyMessage?: string;
};

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  emptyMessage = "Data tidak ditemukan.",
}: SearchableSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selectedOption = useMemo(
    () => options.find((option) => option.id === value),
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return options;
    }

    return options.filter((option) => option.name.toLowerCase().includes(needle));
  }, [options, query]);

  return (
    <div className="searchable-select">
      <input
        value={open ? query : selectedOption?.name ?? query}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery(selectedOption?.name ?? query);
        }}
        onBlur={() => {
          window.setTimeout(() => {
            setOpen(false);
            setQuery(selectedOption?.name ?? "");
          }, 120);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          if (value) {
            onChange("");
          }
          setOpen(true);
        }}
      />

      {open ? (
        <div className="searchable-select-menu">
          {filteredOptions.length === 0 ? (
            <div className="searchable-select-empty">{emptyMessage}</div>
          ) : (
            filteredOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className="searchable-select-item"
                disabled={option.disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.id);
                  setQuery(option.name);
                  setOpen(false);
                }}
              >
                <span>{option.name}</span>
                {option.statusLabel ? <em>{option.statusLabel}</em> : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
