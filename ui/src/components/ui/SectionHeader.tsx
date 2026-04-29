interface Props {
  children: React.ReactNode;
  color?: "mid" | "dim";
}

export function SectionHeader({ children, color = "mid" }: Props) {
  return (
    <span
      className={`font-family-ui text-xs font-black uppercase tracking-widest ${color === "mid" ? "text-mid" : "text-dim"}`}
    >
      {children}
    </span>
  );
}
