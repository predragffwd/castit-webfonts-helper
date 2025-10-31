### -----------------------
# --- Stage: development
# --- Purpose: Local dev environment (no application deps)
### -----------------------
FROM node:24.11.0-trixie AS development

# Replace shell with bash so we can source files
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

# Set debconf to run non-interactively
RUN echo 'debconf debconf/frontend select Noninteractive' | debconf-set-selections

# Install base dependencies 
RUN apt-get update && apt-get install -y -q --no-install-recommends \
    apt-transport-https \
    build-essential \
    ca-certificates \
    curl \
    git \
    jpegoptim \
    libssl-dev \
    lsof \
    optipng \
    tini \
    wget \
    && rm -rf /var/lib/apt/lists/*

# global npm installs
RUN npm install -g grunt-cli@1.2.0 \
    && npm cache clean --force

WORKDIR /app

### -----------------------
# --- Stage: builder
# --- Purpose: Installs application deps and builds the service
### -----------------------

FROM development AS builder

# install server and bundler deps
COPY package.json /app/package.json
COPY package-lock.json* /app/
RUN npm ci --only=production=false

# install clientside deps (bower is a managed application local dev dep)
COPY bower.json /app/bower.json
COPY .bowerrc /app/.bowerrc
RUN  ./node_modules/.bin/bower install

# copy in all workspace files
COPY . /app/

# build dist
RUN grunt build

# prepare production node_modules (this cleans up dev deps)
RUN rm -rf node_modules && npm ci --only=production

### -----------------------
# --- Stage: production
# --- Purpose: Final step from a new slim image. this should be a minimal image only housing dist (production service)
### -----------------------
FROM node:24.11.0-trixie AS production

# https://github.com/nodejs/docker-node/blob/7de353256a35856c788b37c1826331dbba5f0785/docs/BestPractices.md
# Node.js was not designed to run as PID 1 which leads to unexpected behaviour when running inside of Docker. 
# You can also include Tini directly in your Dockerfile, ensuring your process is always started with an init wrapper.
RUN apt-get update && apt-get install -y -q --no-install-recommends \
    ca-certificates \
    lsof \
    tini \
    && rm -rf /var/lib/apt/lists/*
	
# Switch to a non-root user - best practice for running containers
USER node

# Set working directory
WORKDIR /app

# copy prebuilt production node_modules
COPY --chown=node:node --from=builder /app/node_modules /app/node_modules

# copy prebuilt dist
COPY --chown=node:node --from=builder /app/dist /app/dist

ENV NODE_ENV=production

# Create volume mount points
VOLUME ["/app/server/logic/localCachedFonts"]

EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node","dist/server/app.js"]