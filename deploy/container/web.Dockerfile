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

ARG VBTECH_SUBMISSION_STATE=disabled
ARG PUBLIC_SMARTCAPTCHA_SITE_KEY
# Doc Forge: пароль и приватные ассеты приходят BuildKit-секретами (не build-arg —
# арги оседают в истории слоёв). Каждый необязателен: без пароля payload не собирается,
# без ассетов инструмент выходит без опции «печать + подпись».
RUN --mount=type=secret,id=vbtech_doc_tool_password \
    --mount=type=secret,id=vbtech_doc_tool_seal \
    --mount=type=secret,id=vbtech_doc_tool_signature \
    set -eu; \
    if [ -s /run/secrets/vbtech_doc_tool_seal ] && [ -s /run/secrets/vbtech_doc_tool_signature ]; then \
      mkdir -p apps/web/private-assets/doc-forge; \
      base64 -d < /run/secrets/vbtech_doc_tool_seal > apps/web/private-assets/doc-forge/seal.png; \
      base64 -d < /run/secrets/vbtech_doc_tool_signature > apps/web/private-assets/doc-forge/signature.png; \
    fi; \
    if [ -s /run/secrets/vbtech_doc_tool_password ]; then \
      VBTECH_DOC_TOOL_PASSWORD="$(cat /run/secrets/vbtech_doc_tool_password)"; \
      export VBTECH_DOC_TOOL_PASSWORD; \
    fi; \
    case "$VBTECH_SUBMISSION_STATE" in \
      disabled) PUBLIC_CONTACT_SUBMISSION_ENABLED=false corepack pnpm --filter @vbtech/web build ;; \
      enabled) test -n "$PUBLIC_SMARTCAPTCHA_SITE_KEY" && \
        PUBLIC_CONTACT_SUBMISSION_ENABLED=true \
        PUBLIC_SMARTCAPTCHA_SITE_KEY="$PUBLIC_SMARTCAPTCHA_SITE_KEY" \
        corepack pnpm --filter @vbtech/web build ;; \
      *) exit 64 ;; \
    esac; \
    rm -rf apps/web/private-assets; \
    if [ -s /run/secrets/vbtech_doc_tool_password ] && [ ! -s apps/web/dist/tools/doc-payload.bin ]; then \
      echo "doc-forge: пароль передан, но payload не собран" >&2; exit 65; \
    fi

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
