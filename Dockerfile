FROM node:18-alpine

WORKDIR /app

# Copy package files from hap-mcp directory
COPY hap-mcp/package*.json ./hap-mcp/

# Set working directory to hap-mcp for npm install
WORKDIR /app/hap-mcp

# Install dependencies
RUN npm install

# Copy the entire application code from hap-mcp
COPY hap-mcp/. .

# Build the application
RUN npm run build

# Set working directory back to /app for CMD
WORKDIR /app

# Specify the command to run the application from hap-mcp/dist
CMD ["node", "hap-mcp/dist/index.js"]
