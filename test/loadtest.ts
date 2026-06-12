
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
console.log("Adding Balance Latency User 1- " + addingBalLatency)


const response2 = await fetch("http://localhost:3000/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "test2", password: "test2" })
})

const data2 = await response2.json() as { token: string }

const addingBalStart2 = performance.now()
const addingBalance2 = await fetch("http://localhost:3000/onramp", {
  method: "POST",
  headers: { "Authorization": `Bearer ${data2.token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ amount: 10000000, symbol: "SOL" })
})
const addingBalEnd2 = performance.now()
const addingBalLatency2 = addingBalEnd2 - addingBalStart2
console.log("Adding Balance Latency User 2- " + addingBalLatency2)


const promise = []
const perpOrderStart = performance.now()
for (let i = 0; i < 5000; i++) {
  const perpOrder = promise.push(fetch("http://localhost:3000/perps/order", {
    method: "POST",
    headers: { "Authorization": `Bearer ${data.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      "side": "buy",
      "type": "limit",
      "symbol": "SOL",
      "intent": "OPEN",
      "margin": 50,
      "leverage": 10,
      "price": Math.floor(Math.random() * 100) + 50,
      "qty": 5
    })
  }))

  const perpOrderSell = promise.push(fetch("http://localhost:3000/perps/order", {
    method: "POST",
    headers: { "Authorization": `Bearer ${data2.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      "side": "sell",
      "type": "limit",
      "symbol": "SOL",
      "intent": "OPEN",
      "margin": 50,
      "leverage": 10,
      "price": Math.floor(Math.random() * 100) + 50,
      "qty": 5
    })
  }))
}
await Promise.all(promise)
const perpOrderEnd = performance.now()
const perpOrderLatency = perpOrderEnd - perpOrderStart
console.log(perpOrderLatency)

const results = await Promise.all(promise)

let perpSucceed = 0
let perpFailed = 0
for (let i = 0; i < results.length; i++) {
  if (results[i].ok === true) {
    perpSucceed++
  } else if (results[i].ok === false) {
    perpFailed++
  }
}
console.log(`Perp Success = ${perpSucceed}`)
console.log(`Perp Failed = ${perpFailed}`)



const promise2 = []
const spotOrderStart = performance.now()
for (let i = 0; i < 5000; i++) {
  const spotOrder = promise2.push(fetch("http://localhost:3000/spot/order", {
    method: "POST",
    headers: { "Authorization": `Bearer ${data.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      "side": "buy",
      "type": "limit",
      "symbol": "SOL",
      "price": Math.floor(Math.random() * 100) + 50,
      "qty": 5
    })
  }))

  const spotOrderSell = promise2.push(fetch("http://localhost:3000/spot/order", {
    method: "POST",
    headers: { "Authorization": `Bearer ${data2.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      "side": "sell",
      "type": "limit",
      "symbol": "SOL",
      "price": Math.floor(Math.random() * 100) + 50,
      "qty": 5
    })
  }))
}
await Promise.all(promise2)
const spotOrderEnd = performance.now()
const spotOrderLatency = spotOrderEnd - spotOrderStart
console.log(spotOrderLatency)

const results2 = await Promise.all(promise2)

let spotSucceed = 0
let spotFailed = 0
for (let i = 0; i < results2.length; i++) {
  if (results2[i].ok === true) {
    spotSucceed++
  } else if (results2[i].ok === false) {
    spotFailed++
  }
}


console.log(`Spot Success = ${spotSucceed}`)
console.log(`Spot Failed = ${spotFailed}`)

