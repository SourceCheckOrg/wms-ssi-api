FROM ubuntu:20.04

RUN apt-get update \
  && apt-get install -y curl gnupg build-essential \
  && curl --silent --location https://deb.nodesource.com/setup_14.x | bash - \
  && apt-get update \
  && apt-get install -y nodejs

WORKDIR /didkit
COPY ./didkit/lib/node ./
RUN npm link

WORKDIR /sc-wms-api
COPY ./wms-api/package.json ./
COPY ./wms-api/package-lock.json ./
RUN npm install
COPY ./wms-api .
RUN npm link didkit
ENV NODE_ENV production
RUN npm run build
EXPOSE 1337

CMD ["npm", "start"]
