FROM node:20-alpine

# Install git, procps, and build tools needed for better-sqlite3 on Alpine ARM64
RUN apk add --no-cache git procps python3 make g++

WORKDIR /app

# Copy package files
COPY package.json ./
RUN npm install --omit=dev

# Copy app code
COPY server.js ./
COPY src/ ./src/
COPY public/ ./public/

# Git config for the CMS user
RUN git config --global user.name "Terminal Eighty CMS" && \
    git config --global user.email "cms@terminaleighty.com" && \
    git config --global init.defaultBranch main

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]
