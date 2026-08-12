import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { checkIcon, chevronDownIcon } from "./icons";

export type MenuSelectOption = {
  value: string;
  label: string;
  marker?: ReactNode;
};

export function MenuSelect({
  value,
  options,
  placeholder,
  ariaLabel,
  className = "",
  onChange,
}: {
  value: string;
  options: MenuSelectOption[];
  placeholder: string;
  ariaLabel: string;
  className?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const option =
      menuRef.current?.querySelector<HTMLButtonElement>(
        "[role='option'][aria-selected='true']",
      ) ?? menuRef.current?.querySelector<HTMLButtonElement>("[role='option']");
    option?.focus();
  }, [open]);

  return (
    <div
      className={`menu-select${className ? ` ${className}` : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
          return;
        }
        if (!open || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) {
          return;
        }
        event.preventDefault();
        const items = Array.from(
          menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='option']") ??
            [],
        );
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const delta = event.key === "ArrowDown" ? 1 : -1;
        items[(index + delta + items.length) % items.length]?.focus();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="menu-select__trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={options.length === 0}
        onClick={() => setOpen((current) => !current)}
      >
        {selected?.marker && (
          <span className="menu-select__marker" aria-hidden="true">
            {selected.marker}
          </span>
        )}
        <span className={selected ? "menu-select__value" : "menu-select__placeholder"}>
          {selected?.label ?? placeholder}
        </span>
        <span className="menu-select__chevron" aria-hidden="true">
          {chevronDownIcon}
        </span>
      </button>
      {open && (
        <div
          ref={menuRef}
          className="menu-select__menu"
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((option) => {
            const optionSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={optionSelected}
                className={`menu-select__option${
                  optionSelected ? " is-selected" : ""
                }`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                {option.marker ? (
                  <span className="menu-select__marker" aria-hidden="true">
                    {option.marker}
                  </span>
                ) : (
                  <span aria-hidden="true" />
                )}
                <span>{option.label}</span>
                {optionSelected && (
                  <span className="menu-select__check" aria-hidden="true">
                    {checkIcon}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
