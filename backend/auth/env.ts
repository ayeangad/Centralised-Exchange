import "dotenv/config"

function readEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing env variable ${name}`)
  return value;
}

export const env = {
  redisUrl: Number(process.env.REDIS_URL),
  jwtSecret: readEnv("JWT_SECRET"),
  adminSecret: readEnv("ADMIN_SECRET"),
  databaseUrl: readEnv("DATABASE_URL")
}
