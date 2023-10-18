/**
 * @param {MockDb} db
 */
exports.onCreateDb = function (db) {
  db.collectionCount.stream = 150;
  db.collectionCount.api_call = 10;
  db.collectionCount.config = 1;
  db.collectionCount.agent = 150;

  db.onBeforeCreateCollectionItem = (collection_name, object, i) => {
    if(collection_name === "stream") {
      object.config_on_disk = JSON.parse(JSON.stringify(object));
    }
    return object;
  }

  db.onCollectionSeed = (collection_name) => {
    if(collection_name === "template") {
      db.data[collection_name].data.push({name: 'globals'})
      db.data[collection_name].data.push({name: 'sports-hd'}) // take it from schema examples
    }
  }

  db.onCollectionItemSave = (collection_name, body) => {
    if(collection_name === "stream") {
      body.config_on_disk = JSON.parse(JSON.stringify(body))
    }
  }
}

let options_ok = (req, res) => {
  res.send("")
}

/**
 * @param {Express} app
 * @param {string} baseUrl
 */
exports.onAppReady = function (app, baseUrl) {
  app.get("/flussonic/api/generate_admin_view_token", (req, res) => {
    res.send(JSON.stringify({token: "admintoken"}));
  })

  app.get("/flussonic/api/updater/status", (req,res) => {
    res.send(JSON.stringify({
      available_to_update: true,
      is_updating: false,
      repo: {
        is_release_branch: true
      },
      launched_version: '20.12',
      last_update_error: null
    }))
  })

  app.ws('/flussonic/api/events', function(ws, req) {
    ws.on('message', function() {
      ws.send(JSON.stringify({}))
    });
  });

  app.get(`${baseUrl}/config`, (req,res) => {
    res.send(JSON.stringify({}));
  });
  app.options(`${baseUrl}/config`, options_ok);
}

/**
 * @param {string} path
 * @param {string} method
 * @param {Express} app
 * @param {Function} handler
 */
exports.onAddRoute = function ({
  path,
  method,
  app,
  handler
}) {
  if(path === "/ui_settings" && method === "get") {
    app.get("/admin3/api/ui_settings", handler)
    app.options(`/admin3/api/ui_settings`,options_ok)
  }

  if(path === "/config" && method === "get") {
    app.get("/flussonic/api/server", handler)
    app.options(`/flussonic/api/server`,options_ok)
  }
}

/**
 * @param {string} operationId
 * @param {Express} app
 * @param {Object} response
 * @param {string} schemaName
 * @param {Object} req - express request
 * @param {Object} res - express response
 * @param getBase64FileContent
 */
exports.modifyResponse = function ({
  operationId,
  app,
  response,
  schemaName,
  req,
  res,
  getBase64FileContent,
}) {
  const logo = getBase64FileContent('media_logo.png');
  if(operationId === "ui_settings_get") {
    const fonts = {
      "light": getBase64FileContent('fira-sans-300.woff2'),
      "medium": getBase64FileContent('fira-sans-500.woff2'),
      "regular": getBase64FileContent('fira-sans-400.woff2'),
    };
    switch (schemaName) {
      case "flussonic":
        response = {
          ...response,
          logo: getBase64FileContent('logoHeaderAdmin.png'),
          logoAuth: getBase64FileContent('logoLoginAdmin.png'),
          favicons: {
            "16": getBase64FileContent('favicon-16.png'),
            "32": getBase64FileContent('favicon-32.png'),
            "48": getBase64FileContent('favicon-48.png'),
            "64": getBase64FileContent('favicon-64.png'),
            "128": getBase64FileContent('favicon-128.png'),
          },
          fonts
        }
        break;
      case "central":
        response.fonts = fonts;
        response.menu_items.streamer_upgrade = null;
        break;
      case "cloud":
        response.menu_items.streamer_upgrade = null;
    }
  }
  if (schemaName === 'streaming') {
    if ([
        'mp4_preview',
        'embed_html',
        'hls_manifest',
    ].includes(operationId)) {
      const restRoutePath = req.route.path.replace('/:name', '');
      let queryString = '';
      if (req.query) {
        queryString = Object.entries(req.query).reduce((previousValue, [key,value]) => {
          previousValue += previousValue ? '&' : '?';
          previousValue += `${key}=${value}`;
          return previousValue
        }, '')
      }
      res.redirect(`https://demo.flussonic.com/clock${restRoutePath}${queryString}`);
      res.send('');
    }
    if (operationId === 'media_logo') {
      const img = Buffer.from(logo, 'base64');
      res.setHeader('content-type', 'image/png');
      res.send(img);
      return undefined;
    }
  }

  return response;
}
