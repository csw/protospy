import { useEffect, useState } from "react";

interface Props {
  bytes: Uint8Array;
  mediaType: string;
}

/** Renders a decoded image body inline via a Blob URL. */
export function ImageView({ bytes, mediaType }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    // Copy into a plain ArrayBuffer — TS6 requires BlobPart to be backed by
    // ArrayBuffer, not SharedArrayBuffer (the union in ArrayBufferLike).
    const blob = new Blob([new Uint8Array(bytes)], { type: mediaType });
    const url = URL.createObjectURL(blob);
    // Blob URL creation is a genuine external-resource side effect that requires
    // cleanup; this is not the derived-state anti-pattern the rule targets.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBlobUrl(url);
    return () => {
      // Clear state so the <img> never points to a revoked URL (important in
      // React strict-mode dev, which double-invokes effects).
      setBlobUrl(null);
      URL.revokeObjectURL(url);
    };
  }, [bytes, mediaType]);

  if (blobUrl == null) return null;

  return (
    <div className="flex items-center justify-center overflow-auto h-full p-4">
      <img src={blobUrl} alt="Image view" className="max-w-full" />
    </div>
  );
}
