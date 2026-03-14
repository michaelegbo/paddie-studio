FROM node:22-alpine
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install && pnpm --filter @paddie-studio/server build
WORKDIR /app/apps/server
EXPOSE 4300
CMD ["node", "dist/apps/server/src/index.js"]
