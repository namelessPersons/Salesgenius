FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY public ./public
COPY package*.json ./
RUN npm install --production
EXPOSE 3001
CMD ["node", "dist/server/index.js"]
