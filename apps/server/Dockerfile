FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install && pnpm --filter @paddie-studio/server build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/server/package.json ./package.json
RUN corepack enable && pnpm install --prod
EXPOSE 4300
CMD ["node", "dist/index.js"]
