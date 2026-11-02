FROM node:24.13.0-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx tsc --noEmit && npx vite build

FROM nginx:1.30.5-alpine
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /src/dist /usr/share/nginx/html
ENV SERVER_NAME=localhost \
    BACKEND_URL=http://backend:8081 \
    FIREBASE_API_KEY=demo-api-key \
    FIREBASE_AUTH_DOMAIN=localhost \
    FIREBASE_PROJECT_ID=demo-contacts \
    FIREBASE_AUTH_EMULATOR_URL=http://localhost:9099 \
    CSP_CONNECT_SRC="http://localhost:9099"
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --retries=30 CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
