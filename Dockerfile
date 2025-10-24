FROM node:18-alpine

WORKDIR /app

# Copy package.json and package-lock.json from the hap-mcp directory
COPY hap-mcp/package*.json ./

# Install dependencies
RUN npm install

# Copy the entire application code from the hap-mcp directory
COPY hap-mcp/. .

# Build the application
RUN npm run build

# Specify the command to run the application
CMD ["node", "dist/index.js"]
