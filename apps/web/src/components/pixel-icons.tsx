import type { ReactNode } from "react";

/** Render a pixel grid ("#" = filled) as crisp SVG squares. Color via currentColor. */
function Pixels({ rows, size = 16, className = "", title }: { rows: string[]; size?: number; className?: string; title?: string }) {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const cells: ReactNode[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === "1" || c === "#") cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />);
    }),
  );
  return (
    <svg
      width={size}
      height={(size / w) * h}
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      fill="currentColor"
      shapeRendering="crispEdges"
      role={title ? "img" : "presentation"}
      aria-label={title}
    >
      {cells}
    </svg>
  );
}

export function IconCheck({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <Pixels
      size={size}
      className={className}
      title="solved"
      rows={[
        "00000001",
        "00000011",
        "00000110",
        "11001100",
        "01111000",
        "00110000",
      ]}
    />
  );
}

export function IconPartial({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <Pixels
      size={size}
      className={className}
      title="partial"
      rows={[
        "011110",
        "111000",
        "110000",
        "110000",
        "111000",
        "011110",
      ]}
    />
  );
}

export function IconEmpty({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <Pixels
      size={size}
      className={className}
      title="unsolved"
      rows={[
        "011110",
        "100001",
        "100001",
        "100001",
        "100001",
        "011110",
      ]}
    />
  );
}

export function IconStar({ size = 12, className = "" }: { size?: number; className?: string }) {
  return (
    <Pixels
      size={size}
      className={className}
      rows={[
        "0001000",
        "0011100",
        "1111111",
        "0111110",
        "0111110",
        "0100010",
      ]}
    />
  );
}

export function IconLock({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <Pixels
      size={size}
      className={className}
      title="locked"
      rows={[
        "0111110",
        "0100010",
        "0100010",
        "1111111",
        "1101011",
        "1100011",
        "1111111",
      ]}
    />
  );
}

export function IconTrophy({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <Pixels
      size={size}
      className={className}
      rows={[
        "1111111",
        "1011101",
        "1011101",
        "0111110",
        "0001000",
        "0011100",
        "0111110",
      ]}
    />
  );
}

export function IconCross({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <Pixels
      size={size}
      className={className}
      title="error"
      rows={[
        "1100011",
        "1110111",
        "0111110",
        "0011100",
        "0111110",
        "1110111",
        "1100011",
      ]}
    />
  );
}

export function IconHourglass({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <Pixels
      size={size}
      className={className}
      title="pending"
      rows={[
        "1111111",
        "0111110",
        "0011100",
        "0001000",
        "0011100",
        "0111110",
        "1111111",
      ]}
    />
  );
}
