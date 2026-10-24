import type { Status } from "@deadpool/shared";

type P = { size?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export function Tombstone({ size = 24, className }: P) {
  return (
    <svg {...base(size)} strokeWidth={1.8} className={className}>
      <path d="M6 21V10a6 6 0 0 1 12 0v11" />
      <path d="M4 21h16" />
      <path d="M12 9v5" />
      <path d="M9.5 11.5h5" />
    </svg>
  );
}

export function Pulse({ size = 16 }: P) {
  return (
    <svg {...base(size)}>
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </svg>
  );
}

export function Warning({ size = 16 }: P) {
  return (
    <svg {...base(size)}>
      <path d="M12 3l9 16H3z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export function Clock({ size = 16 }: P) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function Arrow({ size = 16 }: P) {
  return (
    <svg {...base(size)}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

const LABEL: Record<Status, string> = { alive: "Alive", dead: "Dead", zombie: "Zombie", pending: "Pending" };

export function StatusBadge({ status }: { status: Status }) {
  const icon = { alive: <Pulse size={14} />, dead: <Tombstone size={14} />, zombie: <Warning size={14} />, pending: <Clock size={14} /> }[status];
  return (
    <span className={`badge badge-${status}`}>
      {icon}
      {LABEL[status]}
    </span>
  );
}
