interface Props {
  uri: string;
}

export function QueryParamsStrip({ uri }: Props) {
  const queryIndex = uri.indexOf("?");
  if (queryIndex === -1) return null;

  const queryString = uri.slice(queryIndex + 1);
  const params: Array<{ key: string; value: string }> = [];

  try {
    const usp = new URLSearchParams(queryString);
    usp.forEach((value, key) => {
      params.push({ key, value });
    });
  } catch {
    return null;
  }

  if (params.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-1 bg-bg-sub border-b border-border shrink-0">
      {params.map(({ key, value }, i) => (
        <span key={i} className="font-family-mono text-sm whitespace-nowrap">
          <span className="text-accent">{key}</span>
          <span className="text-dim">=</span>
          <span className="text-ink">{value}</span>
        </span>
      ))}
    </div>
  );
}
