FROM strapi/base

WORKDIR /sc-wms-api

COPY ./package.json ./
COPY ./package-lock.json ./

RUN npm install

COPY . .

ENV NODE_ENV production

RUN npm build

EXPOSE 1337

CMD ["npm", "start"]
