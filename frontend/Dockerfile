# ---------- Stage 1: сборка ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Сначала только манифесты — кэш не сбрасывается при правках кода
COPY package*.json ./
RUN npm ci

# Потом исходники
COPY . .

# Vite собирает в /app/dist
RUN npm run build

# ---------- Stage 2: раздача через nginx ----------
FROM nginx:1.27-alpine AS runner

# Свой конфиг
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Готовый билд из builder
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]