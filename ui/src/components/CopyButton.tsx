import { useEffect, useRef, useState } from "react";
import { Button } from "@ui/components/ui/button";

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
    navigator.clipboard.writeText(text).catch(() => {
      setCopied(false);
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    });
    setCopied(true);
    if (timerRef.current != null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      variant="link"
      size="xs"
      onClick={handleClick}
      disabled={!text}
      className="px-0 font-family-mono text-accent hover:text-ink hover:no-underline"
    >
      {copied ? "Copied!" : "Copy"}
    </Button>
  );
}
