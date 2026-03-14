FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/site/package.json apps/site/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN corepack enable && pnpm install --filter @paddie-studio/site... --filter @paddie-studio/ui...

FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install && pnpm --filter @paddie-studio/site build

FROM node:22-alpine AS runtime
WORKDIR /app
COPY --from=build /app/apps/site .
EXPOSE 3000
CMD ["sh", "-c", "corepack enable && pnpm start"]
