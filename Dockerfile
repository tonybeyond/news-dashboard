# Multi-stage build: compile TypeScript in a full toolchain image, then copy
# only the runtime artifacts into a slim production image.

# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Install all deps (including devDeps for tsc) first for better layer caching.
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Copy sources and build server + client.
COPY tsconfig.json tsconfig.server.json tsconfig.client.json ./
COPY src ./src
COPY scripts ./scripts
COPY public ./public
RUN npm run build

# ---- runtime stage ----
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8000 \
    HOST=0.0.0.0

# Install only production deps.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

# Copy built artifacts.
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/scripts ./scripts

# Drop privileges: run as the unprivileged "node" user provided by the base image.
USER node

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:8000/api/health || exit 1

CMD ["node", "dist/index.js"]
