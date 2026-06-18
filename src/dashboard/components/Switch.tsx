export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label
      className="switch"
      title={checked ? "Active — click to pause" : "Paused — click to resume"}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={label}
      />
      <span className="switch__track" aria-hidden="true" />
    </label>
  );
}
