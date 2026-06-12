
const response = await fetch("http://localhost:3000/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test" })
})

const data = await response.json() as { token: string }

const addingBalStart = performance.now()
const addingBalance = await fetch("http://localhost:3000/onramp", {
  method: "POST",
  headers: { "Authorization": `Bearer ${data.token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ amount: 10000000 })
})
const addingBalEnd = performance.now()
const addingBalLatency = addingBalEnd - addingBalStart
console.log(addingBalLatency)


const promise = []
const perpOrderStart = performance.now()
for (let i = 0; i < 5000; i++) {
  const perpOrder = promise.push(fetch("http://localhost:3000/perps/order", {
    method: "POST",
    headers: { "Authorization": `Bearer ${data.token}` },
    body: JSON.stringify({
      "side": "buy",
      "type": "limit",
      "symbol": "SOL",
      "intent": "OPEN",
      "margin": 50,
      "leverage": 10,
      "price": 100,
      "qty": 5
    })
  }))

  const perpOrderSell = promise.push(fetch("http://localhost:3000/perps/order", {
    method: "POST",
    headers: { "Authorization": `Bearer ${data.token}` },
    body: JSON.stringify({
      "side": "sell",
      "type": "limit",
      "symbol": "SOL",
      "intent": "OPEN",
      "margin": 50,
      "leverage": 10,
      "price": 100,
      "qty": 5
    })
  }))
}
await Promise.all(promise)
const perpOrderEnd = performance.now()
const perpOrderLatency = perpOrderEnd - perpOrderStart
console.log(perpOrderLatency)



const promise2 = []
const spotOrderStart = performance.now()
for (let i = 0; i < 5000; i++) {
  const spotOrder = promise2.push(fetch("http://localhost:3000/spot/order", {
    method: "POST",
    headers: { "Authorization": `Bearer ${data.token}` },
    body: JSON.stringify({
      "side": "buy",
      "type": "limit",
      "symbol": "SOL",
      "price": 100,
      "qty": 5
    })
  }))

  const spotOrderSell = promise2.push(fetch("http://localhost:3000/spot/order", {
    method: "POST",
    headers: { "Authorization": `Bearer ${data.token}` },
    body: JSON.stringify({
      "side": "sell",
      "type": "limit",
      "symbol": "SOL",
      "price": 100,
      "qty": 5
    })
  }))
}
await Promise.all(promise2)
const spotOrderEnd = performance.now()
const spotOrderLatency = spotOrderEnd - spotOrderStart
console.log(spotOrderLatency)

