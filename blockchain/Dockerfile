FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 8545
CMD ["sh", "/app/docker-entrypoint.sh"]
