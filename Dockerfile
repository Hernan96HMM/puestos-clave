# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Instala solo dependencias de producción (sin devDependencies) desde el
# mismo package-lock.json — nada de versiones manuales que puedan quedar
# desincronizadas. Independiente del stage `deps` de arriba (ese incluye
# devDependencies porque `npm run build` las necesita).
FROM node:22-alpine AS deps-prod
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=build --chown=nextjs:nodejs /app/db ./db
# El tracer de `next build` para standalone solo copia lo que detecta desde
# el grafo de módulos del server bundle — bcryptjs se le escapa (usado por
# auth.ts en el login real, no solo por los scripts en /app/scripts), aunque
# es una dependencia de producción normal en package.json. En vez de listar
# a mano qué paquete falta cada vez, reemplazamos el node_modules parcial
# de standalone por el set completo de producción (mismo package-lock.json,
# sin devDependencies) — server.js y los scripts resuelven todo desde un
# único node_modules, sin sorpresas si un script futuro suma otra dependencia.
COPY --from=deps-prod --chown=nextjs:nodejs /app/node_modules ./node_modules
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
