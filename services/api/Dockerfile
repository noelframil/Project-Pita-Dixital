FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source code
COPY tsconfig*.json ./
COPY src ./src

# Build
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy built code
COPY --from=builder /app/dist ./dist

# Copy migrations for automatic deployment
COPY migrations ./migrations

# Set production environment
ENV NODE_ENV=production

# Expose port (default 3001 for Fastify)
EXPOSE 3001

# Run the API
CMD ["npm", "start"]
