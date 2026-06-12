# Centralised Exchange (Spot & Perpetual Futures)

A high-throughput, in-memory matching engine and centralized exchange platform built in TypeScript. Designed to handle both Spot and Perpetual Futures markets with low-latency execution, strict risk management, and zero-fault state mutations under load.

## Architecture Overview

The system is decoupled into isolated services to ensure the core matching loop is never blocked by network or I/O operations.

* **Matching Engine (`/engine`):** The core in-memory state machine. It consumes trade events from an incoming Redis queue, manages the L2 orderbook, and executes risk calculations (isolated margin, real-time PnL, state updates) entirely in RAM for microsecond execution speeds.
* **API Backend (`/backend`):** The public-facing gateway. Handles user authentication, request validation, balance checks, and routes clean payloads to the matching engine via Redis.
* **Database & Persistence (`/prisma`):** PostgreSQL managed via Prisma. Responsible for asynchronous state persistence, user models, and immutable trade history logs. 
* **Testing Suite (`/test`):** Dedicated load-testing environment built to hammer the engine with high-frequency concurrent orders and verify state integrity.


##  Running Locally

### 1. Clone & Install
```bash
git clone [https://github.com/ayeangad/Centralised-Exchange.git](https://github.com/ayeangad/Centralised-Exchange.git)
cd Centralised-Exchange
bun install
```

### 2. Environment Configuration

Create a .env file in the root directory and configure the following required variables:
Code snippet
```env
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://user:password@localhost:5432/exchange
JWT_SECRET=your_jwt_secret_key
ADMIN_SECRET=your_admin_secret_key
```

### 3. Start the Services

The architecture requires running the matching engine and the API backend as separate processes.

Start the Matching Engine (Queue Consumer):

```bash
bun engine/index.ts
```
Start the API Backend:

```bash
bun backend/index.ts
```

## Performance & Load Testing

The engine is engineered to handle sustained high-frequency throughput without memory leaks or state corruption. 

Benchmark results executed via `bun loadtest.ts` (simulating high-concurrency user environments):

* **Perpetual Market Throughput:** 10,000 successful matches (`0` failures).
* **Spot Market Throughput:** 10,000 successful matches (`0` failures).
* **Latency:** Sub-15ms balance addition and initial state loading, maintaining continuous stable execution throughout the 20k total order volume stress test.



## Technologies

**Runtime**: Bun

**Language**: TypeScript

**Database**: PostgreSQL & Redis

**ORM**: Prisma


