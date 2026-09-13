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
  const [box, setBox] = useState<MenuSelectBox | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);

  const updateBox = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    setBox(
      placeMenuSelect(
        trigger.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
        options.length,
      ),
    );
  }, [options.length]);

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
              role="listbox"
              aria-label={ariaLabel}
              style={{
                top: box.top,
                left: box.left,
                width: box.width,
                maxHeight: box.maxHeight,
              }}
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
                    onMouseDown={(event) => {
                      // WebKit blurs before click; without this the menu closes and the click is lost.
                      event.preventDefault();
                    }}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                      triggerRef.current?.focus();
                    }}
                  >
                    {option.marker && (
                      <span className="menu-select__marker" aria-hidden="true">
                        {option.marker}
                      </span>
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
          </>,
          triggerRef.current?.closest(".dashboard, .popup") ?? document.body,
        )}
    </div>
  );
}
