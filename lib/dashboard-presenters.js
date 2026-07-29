// Dashboard-only presentation selectors.
// Every input is an already-verified aggregate from the shared financial engine.
// These selectors do not recognise revenue or reinterpret financial events.

const amount = value => Number(value || 0)

export function collectionPresentation(aggregate = {}) {
  const methods = [
    { name:'Cash', value:amount(aggregate.cash_sales), metric:'cash_sales' },
    { name:'UPI 1', value:amount(aggregate.upi_1_sales), metric:'upi_1_sales' },
    { name:'UPI 2', value:amount(aggregate.upi_2_sales), metric:'upi_2_sales' },
    { name:'Card', value:amount(aggregate.card_sales), metric:'card_sales' },
  ]
  const online = methods.slice(1).reduce((sum, method) => sum + method.value, 0)
  return { methods, online, total:methods.reduce((sum, method) => sum + method.value, 0) }
}
