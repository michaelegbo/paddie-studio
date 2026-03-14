FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install && pnpm --filter @paddie-studio/web build

FROM nginx:1.29-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html/app
