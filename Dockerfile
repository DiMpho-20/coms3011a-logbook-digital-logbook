FROM node:22-alpine

RUN apk add --no-cache openssl
WORKDIR /app

COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/

RUN npm config set registry https://registry.npmmirror.com
RUN npm install --no-audit --no-fund

COPY apps/backend/prisma/schema.prisma ./apps/backend/prisma/
RUN npx prisma generate --schema=apps/backend/prisma/schema.prisma

COPY . .

RUN npm install --workspace=packages/shared --no-audit --no-fund
# packages/shared has its own tsconfig (src -> dist, with declarations) since
# commit c5ab8c1; the backend imports it from dist, so build it with that.
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/backend

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace=apps/backend"]
