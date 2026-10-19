import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { placeMenuSelect, type MenuSelectBox } from "../lib/placeMenuSelect";
import { checkIcon, chevronDownIcon } from "./icons";

// A described option wraps to a second line, and the search field is about two
// option rows tall; placement needs both to size the menu before it renders.
const DESCRIBED_OPTION_ROWS = 1.5;
const SEARCH_ROWS = 2;

export type MenuSelectOption = {
  value: string;
  label: string;
  marker?: ReactNode;
  searchOnly?: boolean;
  description?: string;
};

export function MenuSelect({
  value,
  options,
  placeholder,
  ariaLabel,
  className = "",
  menuMinWidth,
  searchPlaceholder,
  onChange,
}: {
  value: string;
  options: MenuSelectOption[];
  placeholder: string;
  ariaLabel: string;
  className?: string;
  menuMinWidth?: number;
  searchPlaceholder?: string;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<MenuSelectBox | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const visibleOptions = options.filter((option) =>
    query.trim()
      ? option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
      : !option.searchOnly,
  );
  const selected = options.find((option) => option.value === value);
  const placementRows =
    visibleOptions.reduce(
      (rows, option) => rows + (option.description ? DESCRIBED_OPTION_ROWS : 1),
      0,
    ) +
    (searchPlaceholder ? SEARCH_ROWS : 0);

  const choose = (optionValue: string) => {
    onChange(optionValue);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const updateBox = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    setBox(
      placeMenuSelect(
        trigger.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
        placementRows,
        menuMinWidth === undefined ? undefined : { minWidth: menuMinWidth },
      ),
    );
  }, [menuMinWidth, placementRows]);

  useLayoutEffect(() => {
    if (!open) {
      setBox(null);
      return;
    }
    updateBox();
  }, [open, updateBox]);

  useEffect(() => {
    if (!open) return;
    const onScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      updateBox();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='option']") ??
          [],
      );
      if (items.length === 0) return;
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const next = index < 0
        ? (delta === 1 ? 0 : items.length - 1)
        : (index + delta + items.length) % items.length;
      items[next]?.focus();
    };
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", updateBox);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", updateBox);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, updateBox]);

  return (
    <div className={`menu-select${className ? ` ${className}` : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className="menu-select__trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={options.length === 0}
        onClick={() => { setQuery(""); setOpen((current) => !current); }}
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
      {open &&
        box &&
        createPortal(
          <>
            <div
              className="menu-select__backdrop"
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
              }}
            />
            <div
              ref={menuRef}
              className={`menu-select__menu${box.openUp ? " menu-select__menu--up" : ""}`}
              style={{
                top: box.top,
                left: box.left,
                width: box.width,
                maxHeight: box.maxHeight,
              }}
            >
              {searchPlaceholder && (
                <input
                  className="menu-select__search"
                  autoFocus
                  aria-label={searchPlaceholder}
                  placeholder={searchPlaceholder}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                    event.preventDefault();
                    const firstMatch = visibleOptions[0];
                    if (firstMatch) choose(firstMatch.value);
                  }}
                />
              )}
              <div role="listbox" aria-label={ariaLabel}>
                {visibleOptions.map((option) => {
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
                      onMouseDown={(event) => {
                        // WebKit blurs before click; without this the menu closes and the click is lost.
                        event.preventDefault();
                      }}
                      onClick={() => choose(option.value)}
                    >
                      {option.marker && (
                        <span className="menu-select__marker" aria-hidden="true">
                          {option.marker}
                        </span>
                      )}
                      <span>
                        {option.label}
                        {option.description && <small className="menu-select__description">{option.description}</small>}
                      </span>
                      {optionSelected && (
                        <span className="menu-select__check" aria-hidden="true">
                          {checkIcon}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>,
          triggerRef.current?.closest(".dashboard, .popup") ?? document.body,
        )}
    </div>
  );
}
