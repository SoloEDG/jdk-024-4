import { Leaf, Package } from "lucide-react";
import type { GameDocument } from "../../../shared/types";
import type { Command } from "../../../shared/commands";
import { ingredientCatalog } from "../model/catalog";
import { formatDuration, perishRemaining, qualityStars } from "../lib/format";

export function IngredientStore({
  doc,
  send,
}: {
  doc: GameDocument;
  send: (c: Command) => void;
}) {
  const now = doc.clock;
  return (
    <section className="ws-card">
      <div className="section-title">
        <Leaf size={16} />
        <h3>原料仓</h3>
        <span className="ws-muted">
          {doc.workshop.ingredients.reduce((n, b) => n + b.qty, 0)} 份在库
        </span>
      </div>
      <div className="ws-ingredients">
        {doc.workshop.ingredients.length === 0 && (
          <p className="ws-empty">原料仓空了，去岸边采集或处理捕获副产物。</p>
        )}
        {doc.workshop.ingredients.map((b) => {
          const info = ingredientCatalog.find((i) => i.id === b.kind)!;
          const remain = perishRemaining(b, now);
          return (
            <div
              className={
                "ws-ingredient " + (remain < 86400_000 ? "soon" : "")
              }
              key={b.id}
            >
              <span className="ws-ing-icon" style={{ color: info.color }}>
                {info.icon}
              </span>
              <div className="ws-ing-main">
                <strong>
                  {info.name}
                  <small className="ws-source">{info.source}</small>
                </strong>
                <small>
                  {qualityStars(b.quality)} · 香 {b.aroma} · 剩{" "}
                  {formatDuration(remain)}
                </small>
              </div>
              <span className="ws-qty">×{b.qty}</span>
            </div>
          );
        })}
      </div>
      <div className="ws-gather">
        <Package size={13} />
        <span>岸边采集 / 副产物转化：</span>
        {ingredientCatalog.map((i) => (
          <button
            key={i.id}
            className="ws-gather-btn"
            title={`${i.note}（基准保鲜 ${formatDuration(i.baseShelfLife)}）`}
            onClick={() =>
              send({
                type: "workshop/gather",
                kind: i.id,
                qty: 2,
                quality: ((Math.floor(doc.clock / 86400_000) % 3) + 1) as 1 | 2 | 3,
              })
            }
          >
            {i.icon} {i.name}
          </button>
        ))}
      </div>
    </section>
  );
}
