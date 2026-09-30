FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /app/runtime && chown node:node /app/runtime
ENV HOST=0.0.0.0 PORT=3120 RADAR_DATA_DIR=/app/runtime
USER node
EXPOSE 3120
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:3120/api/health || exit 1
CMD ["node", "--use-env-proxy", "--disable-warning=UNDICI-EHPA", "server.mjs"]
