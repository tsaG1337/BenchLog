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
#
# Uses the committed lockfile with `npm ci` rather than `npm install`.
# This isn't just a speed/reproducibility nicety here: `npm install`
# with no lockfile forces npm to compute the entire ~575-package
# dependency tree and hoisting layout from scratch every build, and
# npm 10.8.2's resolver reliably hung indefinitely partway through that
# computation (confirmed via npm's debug log: it had already finished
# every network fetch and was stuck inside its own reification/hoisting
# step, not waiting on anything external). `npm ci` skips that
# from-scratch resolution entirely by trusting the lockfile, and
# reproducibly installs cleanly in seconds.
COPY server/package.json server/package-lock.json ./server/
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && cd server && npm ci --no-audit \
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
