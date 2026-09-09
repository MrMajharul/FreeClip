FROM node:20-bullseye-slim

# Install Python and FFmpeg (required for yt-dlp)
RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp globally
RUN wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Copy root monorepo config
COPY package*.json ./

# Copy API workspace manifests first (layer cache)
COPY apps/api/package*.json ./apps/api/
COPY apps/api/tsconfig.json ./apps/api/

# Install all dependencies
RUN npm install

# Copy source code
COPY apps/api/src ./apps/api/src

# Compile TypeScript → JavaScript (production build)
WORKDIR /app/apps/api
RUN npm run build

# Remove devDependencies to slim the image
RUN npm prune --production

# Expose port
EXPOSE 4000

# Run production build
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
