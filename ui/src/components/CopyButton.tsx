import { useEffect, useRef, useState } from "react";

interface Props {
  text?: string;
}

export function CopyButton({ text }: Props) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
    };
  }, []);

  function handleClick() {
    if (text == null) return;
    void navigator.clipboard.writeText(text);
    setCopied(true);
    if (timerRef.current != null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleClick}
      disabled={!text}
      className="font-family-mono text-xs text-accent hover:text-ink transition-colors cursor-pointer disabled:text-dim disabled:cursor-not-allowed disabled:opacity-50"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
