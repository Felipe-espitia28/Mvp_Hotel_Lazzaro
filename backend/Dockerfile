# Backend del MVP hotelero (NestJS + Prisma).
# D-16: dos etapas. La primera compila con todas las dependencias; la imagen final
# solo lleva las de producción, el código compilado y Prisma, y corre sin root.

# --- Compilación ---
FROM node:24-alpine AS compilacion

# Prisma necesita OpenSSL en Alpine.
RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

# --- Imagen final ---
FROM node:24-alpine

RUN apk add --no-cache openssl

ENV NODE_ENV=production
WORKDIR /app

# Sin Jest, TypeScript ni la CLI de Nest. La CLI de Prisma sí está en
# dependencies: aplica las migraciones al arrancar.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# El esquema y las migraciones (incluida la restricción de no-sobreventa) y los
# logos que usa el seed de la demo (prisma/logos).
COPY --from=compilacion /app/prisma ./prisma
COPY --from=compilacion /app/dist ./dist
RUN npx prisma generate

# Usuario sin privilegios que trae la imagen oficial de Node.
USER node

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/salud > /dev/null || exit 1

# Aplica las migraciones pendientes y arranca la API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
