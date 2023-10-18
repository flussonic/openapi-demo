import OpenAPISampler from "openapi-sampler";
import util from "util";
import * as fs from 'fs';
import {isObject} from "./utils/is.mjs";

const getBase64FileContent = (path) => {
  return fs.readFileSync(`./server/static/${path}`,{ encoding: 'base64' });
}

function at_path(object, path) {
  if (!object || path.length === 0) return object
  return at_path(object[path.shift()], path)
}

function deep_merge_recursive(object, delta, path) {
  Object.keys(delta).forEach((k) => {
    if(delta[k] == null || delta[k] === undefined) {
      delete(object[k]);
    } else if(!object.hasOwnProperty(k) || object[k] === null) {
      object[k] = delta[k];
    } else if(isObject(object[k])) {
      deep_merge_recursive(object[k], delta[k], path.concat([k]));
    } else {
      object[k] = delta[k];
    }
  })
}

const deep_merge = (object0, delta) => {
  let object = JSON.parse(JSON.stringify(object0));
  deep_merge_recursive(object, delta, []);
  return object;
}

/**
 * Получить схему элемента коллекции.
 * Решает проблему получения с использованием allOf.
 * @param itemsObject {object} - ссылка на элемент
 * @param api - full api schema
 * @return {object}
 */
function getCollectionItem(itemsObject, api) {
  if (itemsObject['$ref']) {
    let collection_type = itemsObject['$ref'].replace("#/components/schemas/","");
    return api.components.schemas[collection_type];
  } else if (itemsObject['allOf']) {
    return itemsObject['allOf'].reduce((previousValue, currentValue) => {
      let componentSchema = currentValue['$ref'].replace("#/components/schemas/","");
      return deep_merge(previousValue, api.components.schemas[componentSchema]);
    }, {});
  }
  return itemsObject;
}

/**
 * @callback onAddRouteCallback
 * @param {object} params
 * @param {string} params.path
 * @param {string} params.method
 * @param {object} params.app
 * @param {function} params.handler
 */
/**
 * @param {object} params
 * @param {object} params.api - full api schema
 * @param {Object} params.app - express app
 * @param {string} params.baseUrl
 * @param {MockDb} params.db
 * @param {onAddRouteCallback} params.onAddRoute
 * @param {Function} modifyResponse
 * @param {string} schemaName
 */
export function generateRoutes({
  api,
  app,
  baseUrl,
  db,
  onAddRoute,
  modifyResponse,
  schemaName
}) {
  let options_ok = (req, res) => {
    res.send("")
  }

  for(let p in api.paths) {
    // replace variables e.g. {name} -> :name
    const p0 = p.replaceAll(
      /{[^}]+}/g,
      (v) => v.replace('{', ':').replace('}', '')
    );
    const p1 = baseUrl + p0;
    delete p.parameters;
    for(let m in api.paths[p]) {
      if(m == "parameters") // not an operation
        continue;

      const method = api.paths[p][m];
      let collection_name = undefined;
      let schema = at_path(method, ["responses","200","content","application/json","schema"])
      let handler = undefined;

      if(!method.operationId) {
        console.log(`orphan method ${m} ${p} ${util.inspect(method)}`);
        continue;
      }

      if(method.operationId.endsWith("_list")) {
        collection_name = method.operationId.replace("_list","").replace(/s$/,'');
        let response_type = api.components.schemas[schema['$ref'].replace("#/components/schemas/","")];
        let props = response_type.allOf ?
          response_type.allOf.find((e) => e.type == "object").properties :
          response_type.properties;

        let collection_key = Object.keys(props).find((k) => props[k].type == 'array');
        const collection_item = getCollectionItem(props[collection_key].items, api)
        // filling db with list item
        db.db_seed(collection_name, collection_item, schemaName);

        handler = (req, res) => {
          res.type('json');
          console.log(`GET ${collection_name} ${util.inspect(req.params)}`);
          let response = {};


          let collection = db.db_collection(req.headers['session'], collection_name, req.query);

          // pagination
          if (req.query.limit) {
            const limitNumber = +req.query.limit;
            const startIndex = req.query.cursor ? +req.query.cursor : 0;

            const lastIndex = startIndex + limitNumber;
            if (lastIndex < collection.length ) {
              response.next = lastIndex;
            }

            if (startIndex > 0) {
              response.prev = `${startIndex - limitNumber}`;
            }

            response.estimated_count = collection.length;

            collection = collection.slice(startIndex, lastIndex);
          }
          response[collection_key] = collection;
          const modifiedResponse = modifyResponse({
            operationId: method.operationId, app, response, schemaName, req, res, getBase64FileContent
          });
          res.send(`${JSON.stringify(modifiedResponse)}\n`);
        }
      }

      if(method.operationId.endsWith("_get")) {
        collection_name = method.operationId.replace("_get","");
        db.db_seed(collection_name, schema, schemaName);

        handler = (req, res) => {
          res.type('json');
          console.log(`GET ${collection_name} ${util.inspect(req.params)}`)
          let object = db.db_get(req.headers['session'], collection_name, req.params);
          if(object) {
            const modifiedResponse = modifyResponse({
              operationId: method.operationId, app, response: object, schemaName, req, res, getBase64FileContent
            });
            res.send(`${JSON.stringify(modifiedResponse)}\n`)
          } else {
            res.status(404).send(`${JSON.stringify({error: "not_found"})}\n`)
          }
        }
      }

      if(method.operationId.endsWith("_delete")) {
        collection_name = method.operationId.replace("_delete","");
        handler = (req, res) => {
          res.type('json');
          console.log(`DELETE ${collection_name} ${util.inspect(req.params)}`)
          if(db.db_delete(req.headers['session'], collection_name, req.params)) {
            res.status(204).send('')
          } else {
            res.status(404).send(`${JSON.stringify({error: "not_found"})}\n`)
          }
        }
      }

      if(method.operationId.endsWith("_save")) {
        collection_name = method.operationId.replace("_save","");
        handler = (req, res) => {
          res.type('json');
          console.log(`PUT ${collection_name} ${util.inspect(req.params)} ${util.inspect(req.body)}`)
          let new_object = db.db_save({
            session_id: req.headers['session'],
            collection_name,
            params: req.params,
            body: req.body,
            schema
          });
          const modifiedResponse = modifyResponse({
            operationId: method.operationId, app, response: new_object, schemaName, req, res, getBase64FileContent
          });
          res.send(`${JSON.stringify(modifiedResponse)}\n`);
        }
      }


      if(!handler) handler = (req, res) => {
        console.log(`${(new Date()).getTime()} ${m} ${p}`)
        let response = {};
        if (schema) {
          response = OpenAPISampler.sample(schema, {quiet: true}, api);
        }
        if(req.params.name) {
          response.name = req.params.name;
          if(response.stats)
            response.stats.name = req.params.name;
        }
        const modifiedResponse = modifyResponse({
          operationId: method.operationId, app, response, schemaName, req, res, getBase64FileContent
        });
        if (modifiedResponse) {
          res.send(`${JSON.stringify(modifiedResponse)}\n\n`)
        }
      }
      if(m == "get" || m == "post" || m == "put" || m == "delete" || m == "patch")
        app[m](p1, handler);

      onAddRoute({path: p, method: m, app, handler});
    }

    app.options(p1,options_ok)
  }
}
