FROM node:24-bookworm-slim AS build

WORKDIR /app
RUN npm install --global pnpm@10.34.9
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/api/package.json packages/api/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web/ apps/web/
COPY packages/api/ packages/api/
RUN REVIEWLAB_STANDALONE=1 pnpm build

FROM node:24-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && install -d -o node -g node /data

WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone/ ./
COPY --from=build /app/apps/web/.next/static/ ./apps/web/.next/static/
COPY scripts/backup.ts ./scripts/backup.ts

ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 DATA_DIR=/data TRIAGE_FFMPEG=/usr/bin/ffmpeg
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
