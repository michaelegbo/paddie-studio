FROM node:20-alpine
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install && pnpm --filter @paddie-studio/site build
WORKDIR /app/apps/site
EXPOSE 3000
CMD ["sh", "-c", "corepack enable && pnpm start --hostname 0.0.0.0 --port ${PORT:-3000}"]
