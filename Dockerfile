# Base image
FROM node:18-slim

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install --production

# Bundle app source
COPY . .

# Environment variables (to be overridden at runtime)
ENV PORT=5000
ENV NODE_ENV=production

# Expose port
EXPOSE 5000

# Start command
CMD [ "node", "server.js" ]
