FROM node:24.18.0-alpine AS web-build

WORKDIR /workspace

RUN corepack enable

COPY . .

RUN corepack pnpm install --frozen-lockfile

ARG VBTECH_RELEASE_SHA
RUN case "$VBTECH_RELEASE_SHA" in \
      ""|*[!0-9a-f]*) exit 64 ;; \
    esac && test "${#VBTECH_RELEASE_SHA}" -eq 40
ENV VBTECH_RELEASE_SHA=$VBTECH_RELEASE_SHA

RUN corepack pnpm --filter @vbtech/web build

FROM caddy:2.11.4-alpine AS runtime

ARG VBTECH_RELEASE_SHA
ENV VBTECH_RELEASE_SHA=$VBTECH_RELEASE_SHA

COPY --from=web-build --chown=65532:65532 /workspace/apps/web/dist /srv/vbtech/
COPY --chown=65532:65532 deploy/container/Caddyfile /etc/caddy/Caddyfile
COPY --chmod=0555 deploy/container/entrypoint.sh /usr/local/bin/vbtech-entrypoint

RUN setcap -r /usr/bin/caddy

USER 65532:65532
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1:8080/__health || exit 1
ENTRYPOINT ["/usr/local/bin/vbtech-entrypoint"]
