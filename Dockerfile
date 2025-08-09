# Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Runtime stage
FROM node:20-alpine AS runtime

WORKDIR /app

# Copy built application from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./

# Expose the port the app runs on
EXPOSE 4321

# Set environment to production
ENV HOST=0.0.0.0
ENV PORT=4321
ENV NODE_ENV=production

# Start the application
CMD ["node", "./dist/server/entry.mjs"]