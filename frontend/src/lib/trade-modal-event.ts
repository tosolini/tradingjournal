export interface TradeModalPrefill {
  symbol?: string;
  direction?: "long" | "short";
  entryPrice?: string;
  targetPrice?: string;
  stopLossPrice?: string;
  tradeIdeaId?: number;
}

export function openTradeCreateModal(prefill?: TradeModalPrefill) {
  window.dispatchEvent(
    new CustomEvent<TradeModalPrefill | undefined>("open-trade-create-modal", {
      detail: prefill,
    }),
  );
}
