# ---------- FRONTEND BUILD ----------
FROM node:20-alpine AS builder

ARG BUILD_VERSION=dev
ENV VITE_APP_VERSION=$BUILD_VERSION

WORKDIR /app
COPY . .

RUN npm install
RUN npm run build

# ---------- SERVER ----------
FROM node:20-alpine

WORKDIR /app

# server dependencies (install build tools + native deps in one layer, then clean up)
COPY server/package.json ./server/package.json
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && cd server && npm install \
    && apk del .build-deps

# server code
COPY server ./server

# frontend build
COPY --from=builder /app/dist ./dist

# Aircraft taxonomy — the server reads work-packages.json files out of
# this tree at runtime (see server/tenant-defaults.js). Frontend has
# the same data bundled into dist; this copy is server-only.
COPY src/lib/aircraft ./src/lib/aircraft

ENV PORT=3001

WORKDIR /app/server

CMD ["node","index.js"]
