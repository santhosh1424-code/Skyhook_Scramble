FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.server.json ./
COPY shared ./shared
COPY server ./server
COPY assets/catalog.json ./assets/catalog.json

RUN npx tsc -p tsconfig.server.json

ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist-server/server/index.js"]
