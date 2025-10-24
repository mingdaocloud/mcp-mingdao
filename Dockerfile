FROM node:18-alpine

# Copy the entire hap-mcp directory into /app/hap-mcp
COPY hap-mcp /app/hap-mcp

# Set the working directory to /app/hap-mcp
WORKDIR /app/hap-mcp

# Install dependencies
RUN npm install

# Build the application
RUN npm run build

# Verify the build output
RUN ls -lR dist

# Specify the command to run the application
CMD ["node", "dist/index.js"]
