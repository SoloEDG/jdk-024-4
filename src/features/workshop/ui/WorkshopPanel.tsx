import { useState } from "react";
import { Beaker } from "lucide-react";
import type { GameDocument } from "../../../shared/types";
import type { Command } from "../../../shared/commands";
import { IngredientStore } from "./IngredientStore";
import { OrderPlanner } from "./OrderPlanner";
import { RunningOrders } from "./RunningOrders";
import { ProductJournal } from "./ProductJournal";
import { formatDuration } from "../lib/format";

export function WorkshopPanel({
  doc,
  pinned,
  send,
}: {
  doc: GameDocument;
  pinned: string[];
  send: (c: Command) => void;
}) {
  const [open, setOpen] = useState(false);
  const runningCount = doc.workshop.orders.filter((o) => o.status === "running").length;

  return (
    <section className="workshop-panel" id="workshop">
      <button className="ws-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Beaker size={17} />
        <h2>鱼饵工坊</h2>
        <span className="ws-muted">
          游戏内第 {Math.floor(doc.clock / 86400_000) + 1} 天 ·{" "}
          {formatDuration(doc.clock === 0 ? 0 : doc.clock)}
        </span>
        {runningCount > 0 && <span className="ws-badge">{runningCount} 单进行中</span>}
        <span className="ws-chevron">{open ? "收起" : "展开"}</span>
      </button>

      {open && (
        <div className="ws-body">
          <p className="ws-intro">
            用捕获副产物与岸边采集物制作特制鱼饵。多单一起规划时会完整搜索共存方案，
            不会只喂饱第一单；开工前再次核对库存，预览期间抛竿消耗也会被计入。
          </p>
          <OrderPlanner doc={doc} pinned={pinned} send={send} />
          <RunningOrders doc={doc} send={send} />
          <IngredientStore doc={doc} send={send} />
          <ProductJournal doc={doc} send={send} />
        </div>
      )}
    </section>
  );
}
