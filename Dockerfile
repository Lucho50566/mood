FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4400

COPY . .

EXPOSE 4400
VOLUME ["/app/data"]

# node:sqlite viene incluido en Node 24 (sin dependencias npm)
CMD ["node", "server.js"]
