import { useState } from "react";
import { FlaskConical, Lock, Pin, PinOff, Play, Trash2, AlertTriangle, Search } from "lucide-react";
import type { GameDocument } from "../../../shared/types";
import type { Command } from "../../../shared/commands";
import { recipes, recipeOf, ingredientInfo } from "../model/catalog";
import { isResearched } from "../model/workshop";
import { useWorkshopPlan } from "../lib/useWorkshopPlan";
import { formatDuration, percent } from "../lib/format";

export function OrderPlanner({
  doc,
  pinned,
  send,
}: {
  doc: GameDocument;
  pinned: string[];
  send: (c: Command) => void;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const planning = doc.workshop.orders.filter((o) => o.status === "planning");
  // 纯派生整组预览：不写入持久化数据，渲染期安全
  const plan = useWorkshopPlan(doc, pinned);
  const planByOrder = new Map(plan.orders.map((p) => [p.orderId, p]));

  return (
    <section className="ws-card">
      <div className="section-title">
        <FlaskConical size={16} />
        <h3>配方与制作单</h3>
        <span className="ws-muted">{planning.length} 张待规划</span>
      </div>

      <div className="ws-recipes">
        {recipes.map((r) => {
          const unlocked = isResearched(doc.workshop, r.id);
          return (
            <div key={r.id} className={"ws-recipe " + (unlocked ? "" : "locked")}>
              <div className="ws-recipe-head">
                <strong>{r.name}</strong>
                {!unlocked && (
                  <span className="ws-lock">
                    <Lock size={11} /> 累计捕获 {r.researchRequired} 尾解锁
                  </span>
                )}
              </div>
              <small className="ws-muted">{r.note}</small>
              <div className="ws-recipe-meta">
                <span>香 {r.aromaRange[0]}–{r.aromaRange[1]}</span>
                <span>最低保鲜 {formatDuration(r.minFreshness)}</span>
              </div>
              <div className="ws-recipe-groups">
                {r.groups.map((g, i) => (
                  <small key={i} className="ws-group">
                    {g.label}×{g.amount}：
                    {g.alternatives.map((a) => ingredientInfo(a).name).join(" / ")}
                  </small>
                ))}
              </div>
              {unlocked && (
                <div className="ws-add-row">
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={qty[r.id] ?? 1}
                    onChange={(e) =>
                      setQty((q) => ({ ...q, [r.id]: Math.max(1, +e.target.value || 1) }))
                    }
                  />
                  <button
                    className="ws-btn"
                    onClick={() =>
                      send({
                        type: "workshop/add-order",
                        recipeId: r.id,
                        outputQty: qty[r.id] ?? 1,
                      })
                    }
                  >
                    加入制作单
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {planning.length > 0 && (
        <>
          <div className="ws-plan-head">
            <h4>整组配料预览</h4>
            <div className="ws-plan-actions">
              <button
                className="ws-btn primary"
                disabled={!plan.allFeasible}
                title="开工前会再次核对当前库存，预览期间抛竿消耗也计入"
                onClick={() => send({ type: "workshop/start" })}
              >
                <Play size={12} /> 核对并开工
              </button>
            </div>
          </div>

          {!plan.exhausted && (
            <p className="ws-warn">
              <Search size={13} /> 搜索尚未结束，不能据此宣称缺料；请固定部分用料或减少订单后重试。
            </p>
          )}
          {plan.exhausted && !plan.allFeasible && (
            <p className="ws-warn">
              <AlertTriangle size={13} /> 完整搜索后仍无可行整组方案，见下方各单缺口。
            </p>
          )}
          {plan.allFeasible && (
            <p className="ws-ok">已找到让全部 {planning.length} 张单子同时成立的配料方案。</p>
          )}

          <div className="ws-orders">
            {planning.map((o) => {
              const p = planByOrder.get(o.id);
              const r = recipeOf(o.recipeId);
              const isPinned = pinned.includes(o.id);
              return (
                <div key={o.id} className={"ws-order " + (p?.feasible ? "ok" : "bad")}>
                  <div className="ws-order-head">
                    <strong>
                      {r.name} ×{o.outputQty}
                    </strong>
                    <div>
                      <button
                        className="ws-icon-btn"
                        disabled={!isPinned && !p?.feasible}
                        title={isPinned ? "解除固定" : "固定该单当前配料后重算其他单"}
                        onClick={() =>
                          send({
                            type: "workshop/toggle-pin",
                            id: o.id,
                            allocation: p?.allocation,
                          })
                        }
                      >
                        {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
                        {isPinned ? "已固定" : "固定"}
                      </button>
                      <button
                        className="ws-icon-btn danger"
                        onClick={() => send({ type: "workshop/remove-order", id: o.id })}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {p?.feasible ? (
                    <>
                      <div className="ws-alloc">
                        {Object.entries(p.allocation).map(([bid, n]) => {
                          const batch = doc.workshop.ingredients.find(
                            (b) => b.id === bid,
                          );
                          if (!batch) return null;
                          const info = ingredientInfo(batch.kind);
                          return (
                            <span key={bid} className="ws-alloc-chip">
                              {info.icon} {info.name} ×{n}
                            </span>
                          );
                        })}
                      </div>
                      <div className="ws-order-stats">
                        <span>香味 {p.expectedAroma.toFixed(0)}</span>
                        <span>
                          营养 蛋{percent(p.expectedRatio.protein)}/碳
                          {percent(p.expectedRatio.carb)}/脂
                          {percent(p.expectedRatio.fat)}
                        </span>
                        <span>预计保鲜 {formatDuration(p.expectedFreshness)}</span>
                      </div>
                    </>
                  ) : (
                    <ul className="ws-gaps">
                      {(p?.gaps ?? ["等待规划…"]).map((g, i) => (
                        <li key={i}>{g}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          <div className="ws-leftovers">
            <h4>规划后剩余原料</h4>
            <div className="ws-alloc">
              {doc.workshop.ingredients.map((b) => {
                const left = plan.leftovers[b.id] ?? b.qty;
                const info = ingredientInfo(b.kind);
                return (
                  <span key={b.id} className={"ws-alloc-chip " + (left === 0 ? "empty" : "")}>
                    {info.icon} {info.name} {left}/{b.qty}
                  </span>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
