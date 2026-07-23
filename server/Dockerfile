FROM node:22-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/healthz',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{if(d.includes('ok'))process.exit(0);process.exit(1)})}).on('error',()=>process.exit(1))"

CMD ["node", "index.js"]
