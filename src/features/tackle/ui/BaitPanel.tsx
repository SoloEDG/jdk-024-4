import { PackageOpen, RefreshCw, Check, Timer } from "lucide-react";
import type { GameDocument } from "../../../shared/types";
import type { Command } from "../../../shared/commands";
import { baits } from "../model/baits";
import { attraction, diffusionOf, preferenceOf } from "../lib/affinity";
import { availableStock } from "../model/loadout";
import { formatDuration } from "../../workshop/lib/format";

export function BaitPanel({
  doc,
  busy,
  send,
}: {
  doc: GameDocument;
  busy: boolean;
  send: (c: Command) => void;
}) {
  const choices = attraction(doc.spot, doc.bait);
  const stock = availableStock(doc);
  return (
    <section className="bait-panel">
      <div className="section-title">
        <PackageOpen size={17} />
        <h2>鱼饵盒</h2>
        <button
          className="text-btn"
          disabled={busy}
          onClick={() => send({ type: "resupply" })}
        >
          <RefreshCw size={12} />
          补给
        </button>
      </div>
      <div className="bait-list">
        {baits.map((b) => {
          const earliest = b.crafted
            ? doc.workshop.baitBatches
                .filter((x) => x.bait === b.id && x.perishAt > doc.clock)
                .sort((a, c) => a.perishAt - c.perishAt)[0]
            : undefined;
          return (
            <button
              key={b.id}
              disabled={busy || stock[b.id] < 1}
              onClick={() => send({ type: "bait", id: b.id })}
              className={"bait-card " + (doc.bait === b.id ? "active" : "")}
            >
              <span className="bait-icon" style={{ color: b.color }}>
                {b.icon}
              </span>
              <span>
                <strong>{b.name}</strong>
                <small>
                  {b.note}
                  {b.crafted && earliest && (
                    <em className="bait-fresh">
                      <Timer size={10} />
                      {formatDuration(earliest.perishAt - doc.clock)}
                    </em>
                  )}
                </small>
              </span>
              <span className="stock">
                ×{stock[b.id]}
                {doc.bait === b.id && <Check size={13} />}
              </span>
            </button>
          );
        })}
      </div>
      <p className="bait-hint">
        当前偏好：
        {choices
          .filter((v) => v.fish.baits.includes(doc.bait) || ["paste", "chum"].includes(doc.bait))
          .map((v) => v.fish.name)
          .join("、") || "探索未知鱼群"}
      </p>
      {["paste", "chum"].includes(doc.bait) && (
        <p className="bait-effect">
          本水域 · 扩散 ×{diffusionOf(doc.bait, doc.spot).toFixed(2)} · 咬饵偏好 ×
          {preferenceOf(doc.bait, doc.spot).toFixed(2)}
        </p>
      )}
    </section>
  );
}
