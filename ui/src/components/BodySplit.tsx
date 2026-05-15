import type { Exchange } from "@ui/state/reducer";
import { BodyPane } from "./BodyPane";

interface Props {
  exchange: Exchange;
}

export function BodySplit({ exchange }: Props) {
  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <BodyPane title="Request" body={exchange.requestBody} />
      </div>
      <div className="w-px bg-border shrink-0" />
      <div className="flex-1 overflow-hidden">
        <BodyPane title="Response" body={exchange.responseBody} />
      </div>
    </div>
  );
}
