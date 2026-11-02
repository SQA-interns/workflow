FROM node:24.13.0-alpine
RUN npm install -g firebase-tools@15.34.0 && mkdir -p /emulator /data && chown -R node:node /emulator /data
WORKDIR /emulator
COPY --chown=node:node firebase.json .firebaserc ./
COPY --chown=node:node start.sh /usr/local/bin/start-emulator
USER node
EXPOSE 9099
HEALTHCHECK --interval=5s --timeout=3s --retries=30 CMD wget -qO- http://127.0.0.1:9099/ >/dev/null || exit 1
CMD ["start-emulator"]
