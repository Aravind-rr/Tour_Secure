FROM node:22-slim

WORKDIR /usr/src/app

RUN apt-get update -y && apt-get install -y openssl libssl3 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./

RUN npm install

COPY tsconfig.json ./

COPY src ./src

RUN npm run build

EXPOSE 4000

CMD ["npm", "start"]
