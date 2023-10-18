#!/usr/bin/env node

import express from 'express';
import {load_api} from "./lib/api.mjs";
import process from 'process';
import fs from 'fs';
import bodyParser from 'body-parser';
import expressWsBuilder from 'express-ws';
import { MockDb } from './server/MockDb.mjs';
import { generateRoutes } from './server/generateRoutes.mjs';

const schemaList = [
  {
    name: 'flussonic',
    src: './openapi/flussonic',
    srcFileName: 'flussonic.yml',
    baseUrl: '/streamer/api/v3',
  },
  {
    name: 'cloud',
    src: './openapi/flussonic',
    srcFileName: 'cloud.yml',
    baseUrl: '/cloud/streamer/api/v3',
  },
  {
    name: 'central',
    src: './openapi/flussonic',
    srcFileName: 'central.yml',
    baseUrl: '/central/streamer/api/v3',
  },
  {
    name: 'retroview',
    src: './openapi/retroview',
    srcFileName: 'retroview.yml',
    baseUrl: '/retroview/retroview/api/v3',
  },
  {
    name: 'billing-client',
    src: './openapi/billing',
    srcFileName: 'billing-client.yml',
    baseUrl: '/billing-client/client/api/v1',
  },
  {
    name: 'talks',
    src: './openapi/talks',
    srcFileName: 'talks.yml',
    baseUrl: '/talks/talks/api/v1',
  },
  {
    name: 'streaming',
    src: './openapi/flussonic',
    srcFileName: 'streaming.yml',
    baseUrl: '',
  },
  {
    name: 'watcher',
    src: './openapi/watcher',
    srcFileName: 'watcher.yml',
    baseUrl: '/watcher/admin-api/v3',
  },
  {
    name: 'watcher-client',
    src: './openapi/watcher',
    srcFileName: 'client.yml',
    baseUrl: '/watcher/client-api/v3',
  },
  {
    name: 'client-area',
    src: './openapi/client-area',
    srcFileName: 'client-area.yml',
    baseUrl: '/client-area/api/v1',
  },
]

let app = express()
let expressWs = expressWsBuilder(app);

app.use(function(req, res, next) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Expose-Headers', '*');
  next();
});
app.use(bodyParser.json())

// server list
app.get('/', (req, res) => {
  res.send(schemaList.map(({name: schemaName, baseUrl}) => (
      `<a href="${baseUrl}">${schemaName}</a>`
  )).join('<br />'));
});
schemaList.forEach(async ({name: schemaName, baseUrl, src, srcFileName}) => {
  const schemaPath = `${src}/${srcFileName}`
  if (!fs.existsSync(schemaPath)) {
    console.log(`Schema not found at ${schemaPath}`)
    return;
  }

  // get callbacks from modifyMockServer.js
  const modifyMockServerPath = `${src}/modifyMockServer.js`;

  let onAppReady = () => {};
  let onAddRoute = () => {};
  let onCreateDb = () => {};
  let modifyResponse = ({response}) => response;
  if (fs.existsSync(modifyMockServerPath)) {
    let callbacks = await import(modifyMockServerPath);
    if (callbacks.onAppReady) {
      onAppReady = callbacks.onAppReady;
    }
    if (callbacks.onAddRoute) {
      onAddRoute = callbacks.onAddRoute;
    }
    if (callbacks.onCreateDb) {
      onCreateDb = callbacks.onCreateDb;
    }
    if (callbacks.modifyResponse) {
      modifyResponse = callbacks.modifyResponse;
    }
  }


  load_api(schemaPath, schemaName).then((api) => {
    // add default success msg
    app.get(baseUrl, (req, res) => {
      res.send(`Mock server: <b>${schemaName}</b>`);
    })
    // create mock db
    const db = new MockDb(api);
    // modify db
    onCreateDb(db, api);
    generateRoutes({
      schemaName,
      api,
      app,
      baseUrl,
      db,
      onAddRoute,
      modifyResponse
    });

    // modify app
    onAppReady(app, baseUrl);
  });
})

app.use(function(req, res, next) {
  const reject = () => {
    res.setHeader('www-authenticate', 'Basic')
    res.sendStatus(401)
  }
  if (req.path.indexOf('/private') === 0) {
    const authorization = req.headers.authorization;
    if(!authorization) {
      return reject()
    }
    const [username, password] = Buffer.from(authorization.replace('Basic ', ''), 'base64').toString().split(':')
    if(! (username === 'secret' && password === 'pass')) {
      return reject()
    }
  }
  next();
});

app.use(express.static('html'))


const PORT = process.env.PORT || 4010;
let server = app.listen(PORT);

console.log(`Server started http://127.0.0.1:${PORT}`);

if (process.argv.slice(2)[0] === 'test') {
  console.log('Stop in 3 seconds');
  await new Promise(resolve => setTimeout(resolve, '3000'));
  server.close();
}
