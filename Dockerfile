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

# work package templates
COPY templates ./templates

ENV PORT=3001

WORKDIR /app/server

CMD ["node","index.js"]
