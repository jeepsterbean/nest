export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return (
      <div className="sparkline sparkline--empty">
        {values.length === 1 ? "First entry logged" : "No entries yet"}
      </div>
    );
  }
  const width = 100;
  const height = 32;
  const pad = 3;
  const stepX = (width - pad * 2) / (values.length - 1);
  const yFor = (value: number) =>
    height - pad - ((value - 1) / 4) * (height - pad * 2);
  const points = values.map(
    (value, i) => [pad + i * stepX, yFor(value)] as const,
  );
  const line = points
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const [lastX, lastY] = points[points.length - 1];
  const area = `M ${points[0][0].toFixed(2)},${height} L ${line
    .split(" ")
    .join(" L ")} L ${lastX.toFixed(2)},${height} Z`;
  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path className="sparkline__area" d={area} />
      <polyline
        className="sparkline__line"
        points={line}
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        className="sparkline__dot"
        points={`${lastX},${lastY} ${lastX},${lastY}`}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
