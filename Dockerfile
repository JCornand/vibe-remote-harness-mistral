# Vibe Remote Harness Mistral - Dockerfile
# ISO 27001 Compliant

# ============================================================================
# STAGE 1: Build stage
# ============================================================================

# Use official Node.js image
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies only when needed
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production --ignore-scripts

# ============================================================================
# STAGE 2: Production stage
# ============================================================================

# Use official Node.js runtime as parent image
FROM node:18-alpine AS production

# Set working directory
WORKDIR /app

# Copy from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY . .

# Create non-root user for security (ISO 27001 - A.9.4.1)
RUN addgroup -S appuser && \
    adduser -S next -u 1000 -G appuser appuser

# Change ownership of the app directory
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Create necessary directories
RUN mkdir -p /app/logs /app/config

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "src/server/index.js"]
