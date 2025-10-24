FROM node:18-alpine

WORKDIR /app

# Copy the entire hap-mcp directory into /app/hap-mcp
COPY ..

# Set the working directory to /app/hap-mcp
WORKDIR /app/hap-mcp

# Install dependencies
RUN npm install

# Build the application
RUN npm run build

# Specify the command to run the application
CMD ["node", "dist/index.js"]
