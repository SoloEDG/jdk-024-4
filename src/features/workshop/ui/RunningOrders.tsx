import { Factory, Ban, CheckCircle2 } from "lucide-react";
import type { GameDocument } from "../../../shared/types";
import type { Command } from "../../../shared/commands";
import { recipeOf, ingredientInfo } from "../model/catalog";
import { orderProgress } from "../model/workshop";
import { formatDuration } from "../lib/format";

export function RunningOrders({
  doc,
  send,
}: {
  doc: GameDocument;
  send: (c: Command) => void;
}) {
  const running = doc.workshop.orders.filter(
    (o) => o.status === "running" || o.status === "done" || o.status === "cancelled",
  );
  if (running.length === 0) return null;
  const now = doc.clock;

  return (
    <section className="ws-card">
      <div className="section-title">
        <Factory size={16} />
        <h3>工坊操作台</h3>
        <span className="ws-muted">分段消耗 · 取消只退未用</span>
      </div>
      <div className="ws-running">
        {running.map((o) => {
          const r = recipeOf(o.recipeId);
          const prog = orderProgress(o);
          return (
            <div key={o.id} className={"ws-run " + o.status}>
              <div className="ws-order-head">
                <strong>
                  {r.name} ×{o.outputQty}
                  <small className={`ws-status ${o.status}`}>
                    {o.status === "running"
                      ? "制作中"
                      : o.status === "done"
                        ? "已完工"
                        : "已取消"}
                  </small>
                </strong>
                {o.status === "running" && (
                  <div>
                    <button
                      className="ws-icon-btn danger"
                      onClick={() => send({ type: "workshop/cancel", id: o.id })}
                    >
                      <Ban size={13} /> 取消
                    </button>
                    <button
                      className="ws-icon-btn"
                      disabled={prog.fed < prog.need}
                      onClick={() => send({ type: "workshop/complete", id: o.id })}
                    >
                      <CheckCircle2 size={13} /> 完工
                    </button>
                  </div>
                )}
              </div>

              <progress max={prog.need} value={prog.fed} />
              <small className="ws-muted">
                已投料 {prog.fed}/{prog.need} 份
                {o.mixedPerishAt !== null &&
                  ` · 混合料期限 ${formatDuration(o.mixedPerishAt - now)}（重新混合不延长）`}
              </small>

              {o.status === "running" &&
                o.stages.map((stage, gi) => {
                  const group = r.groups[gi];
                  const usable = doc.workshop.ingredients.filter(
                    (b) =>
                      b.perishAt > now &&
                      b.qty > 0 &&
                      group.alternatives.includes(b.kind),
                  );
                  return (
                    <div key={gi} className="ws-stage">
                      <div className="ws-stage-head">
                        <span>
                          {gi + 1}. {group.label}（{stage.fed}/{stage.need}）
                        </span>
                        <small className="ws-muted">
                          可替：{group.alternatives.map((a) => ingredientInfo(a).name).join(" / ")}
                        </small>
                      </div>
                      <div className="ws-feed-btns">
                        {usable.length === 0 && (
                          <small className="ws-warn">该段暂无未过期的匹配原料</small>
                        )}
                        {usable.map((b) => {
                          const info = ingredientInfo(b.kind);
                          return (
                            <button
                              key={b.id}
                              className="ws-feed-btn"
                              disabled={stage.fed >= stage.need}
                              onClick={() =>
                                send({
                                  type: "workshop/feed",
                                  orderId: o.id,
                                  stageIndex: gi,
                                  batchId: b.id,
                                  amount: 1,
                                })
                              }
                            >
                              {info.icon} {info.name} ×{b.qty}
                              <small>剩 {formatDuration(b.perishAt - now)}</small>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
