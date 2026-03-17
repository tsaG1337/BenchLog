# ---------- FRONTEND BUILD ----------
FROM node:20 AS builder

WORKDIR /app
COPY . .

RUN npm install
RUN npm run build

# ---------- SERVER ----------
FROM node:20

WORKDIR /app

# server dependencies
COPY server/package.json ./server/package.json
RUN cd server && npm install

# server code
COPY server ./server

# frontend build
COPY --from=builder /app/dist ./dist

ENV PORT=3001

WORKDIR /app/server

CMD ["node","index.js"]
