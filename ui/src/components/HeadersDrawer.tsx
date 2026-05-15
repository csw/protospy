import { useState } from "react";
import type { ProxyHeaders } from "@bindings/ProxyHeaders";
import { SectionHeader } from "./ui/SectionHeader";

interface Props {
  requestHeaders?: ProxyHeaders;
  responseHeaders?: ProxyHeaders;
}

function HeaderTable({ headers }: { headers: ProxyHeaders }) {
  return (
    <table className="w-full text-xs font-family-mono">
      <tbody>
        {headers.map((h, i) => (
          <tr
            key={i}
            className="border-b border-border last:border-0 hover:bg-bg-hl"
          >
            <td className="py-0.5 pr-4 text-accent whitespace-nowrap align-top w-48">
              {h.name}
            </td>
            <td className="py-0.5 text-ink break-all">{h.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function HeadersDrawer({ requestHeaders, responseHeaders }: Props) {
  const [open, setOpen] = useState(false);

  const hasHeaders =
    (requestHeaders != null && requestHeaders.length > 0) ||
    (responseHeaders != null && responseHeaders.length > 0);

  if (!hasHeaders) return null;

  return (
    <div className="border-t border-border shrink-0">
      {/* Toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 h-7 bg-bg-sub hover:bg-bg-hover transition-colors text-left"
        aria-expanded={open}
      >
        <SectionHeader>Headers</SectionHeader>
        <span className="text-dim text-xs">{open ? "▾" : "▸"}</span>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="px-3 py-2 bg-bg-pane overflow-auto max-h-56">
          {requestHeaders != null && requestHeaders.length > 0 && (
            <div className="mb-3">
              <div className="mb-1">
                <SectionHeader color="dim">Request</SectionHeader>
              </div>
              <HeaderTable headers={requestHeaders} />
            </div>
          )}
          {responseHeaders != null && responseHeaders.length > 0 && (
            <div>
              <div className="mb-1">
                <SectionHeader color="dim">Response</SectionHeader>
              </div>
              <HeaderTable headers={responseHeaders} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
