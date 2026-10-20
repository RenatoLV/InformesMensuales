FROM node:22-bookworm-slim
WORKDIR /app/optimizado
COPY optimizado/package*.json ./
RUN npm ci --omit=dev && npx playwright install --with-deps chromium
COPY optimizado/ ./
COPY plantilla-html/plantilla.js plantilla-html/formato.js /app/plantilla-html/
COPY plantilla-html/assets/ /app/plantilla-html/assets/
ENV NODE_ENV=production PORT=8080
CMD ["node", "index.js"]
