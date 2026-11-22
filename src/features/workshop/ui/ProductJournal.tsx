import { Award, PackageCheck, ScrollText } from "lucide-react";
import { useState } from "react";
import type { GameDocument } from "../../../shared/types";
import type { Command } from "../../../shared/commands";
import { recipes, recipeOf, ingredientInfo } from "../model/catalog";
import { formatDuration, qualityStars } from "../lib/format";

export function ProductJournal({ doc }: { doc: GameDocument; send: (c: Command) => void }) {
  const [tab, setTab] = useState<"stock" | "research" | "log">("stock");
  const now = doc.clock;

  return (
    <section className="ws-card">
      <div className="section-title">
        <PackageCheck size={16} />
        <h3>成品与手记</h3>
      </div>
      <div className="mini-tabs">
        <button className={tab === "stock" ? "active" : ""} onClick={() => setTab("stock")}>
          <PackageCheck size={13} /> 成品库存
        </button>
        <button className={tab === "research" ? "active" : ""} onClick={() => setTab("research")}>
          <Award size={13} /> 研究解锁
        </button>
        <button className={tab === "log" ? "active" : ""} onClick={() => setTab("log")}>
          <ScrollText size={13} /> 批次追溯
        </button>
      </div>

      {tab === "stock" && (
        <div className="ws-products">
          {doc.workshop.baitBatches.length === 0 && (
            <p className="ws-empty">还没有成品，先在工坊完成一张制作单。</p>
          )}
          {doc.workshop.baitBatches.map((b) => {
            const r = recipeOf(b.recipeId);
            const expired = b.perishAt <= now;
            return (
              <div key={b.id} className={"ws-product " + (expired ? "expired" : "")}>
                <div>
                  <strong>{r.name}</strong>
                  <small>
                    {qualityStars(b.quality)} · ×{b.qty} ·{" "}
                    {expired ? "已过期" : `剩 ${formatDuration(b.perishAt - now)}`}
                  </small>
                </div>
                <span className="ws-batch-id">{b.id}</span>
              </div>
            );
          })}
        </div>
      )}

      {tab === "research" && (
        <div className="ws-research">
          {recipes.map((r) => {
            const rec = doc.workshop.research.find((x) => x.recipeId === r.id);
            const unlocked = !!rec;
            return (
              <div key={r.id} className={"ws-research-item " + (unlocked ? "on" : "")}>
                <Award size={15} />
                <div>
                  <strong>{r.name}</strong>
                  <small>
                    {unlocked
                      ? `已解锁 · 解锁时累计捕获 ${rec.catchesAtUnlock} 尾`
                      : `累计捕获 ${r.researchRequired} 尾解锁（当前 ${doc.stats.catches} 尾）`}
                  </small>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "log" && (
        <div className="ws-log">
          {doc.workshop.batchLog.length === 0 && (
            <p className="ws-empty">尚无完工批次记录。</p>
          )}
          {doc.workshop.batchLog.map((b) => {
            const r = recipeOf(b.recipeId);
            return (
              <div key={b.id} className="ws-log-item">
                <div className="ws-log-head">
                  <strong>
                    {r.name} ×{b.qty}
                  </strong>
                  <small className="ws-batch-id">{b.id}</small>
                </div>
                <div className="ws-alloc">
                  {b.usedIngredients.map((u) => {
                    const info = ingredientInfo(u.kind);
                    return (
                      <span key={u.batchId} className="ws-alloc-chip">
                        {info.icon} {info.name} ×{u.amount}
                      </span>
                    );
                  })}
                </div>
                <small className="ws-muted">
                  实际配方 {b.recipeId} · 保鲜至 {formatDuration(b.perishAt - now)}
                </small>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
