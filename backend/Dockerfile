# Backend del MVP hotelero (NestJS + Prisma) para la demo con docker compose.
FROM node:24-alpine

# Prisma necesita OpenSSL en Alpine.
RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

EXPOSE 3000

# Aplica las migraciones pendientes (incluida la restricción de no-sobreventa)
# y arranca la API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
