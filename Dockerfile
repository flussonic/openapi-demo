FROM node:18-bullseye-slim

WORKDIR /schemas
RUN apt update && apt install -y make yarn

RUN yarn set version 3.5.0
ADD package.json ./
ADD yarn.lock ./
ADD .yarnrc.yml ./
ADD Makefile ./

RUN yarn install


ADD openapi openapi/
ADD ruleset.js ./

ARG FLUSSONIC_VERSION
ARG WATCHER2_VERSION
ARG IRIS_VERSION

ENV FLUSSONIC_VERSION=${FLUSSONIC_VERSION}
ENV WATCHER2_VERSION=${WATCHER2_VERSION}
ENV IRIS_VERSION=${IRIS_VERSION}

ADD linter.mjs ./
ADD lib ./lib
RUN make doc

ADD server ./server
ADD server.mjs .
ADD jest.config.js .
