import OpenAPIParser from "@readme/openapi-parser";
import {bundle} from "./bundle.mjs";
import util from 'util';
import fs from 'fs';
import { exec as execAsync } from 'child_process';
import { clear_api_scope, clear_api_fields } from './api-scope.mjs';
const exec = util.promisify(execAsync);




function make_public_api(api0) {
  let api = JSON.parse(JSON.stringify(api0));
  for(let t in api.components.schemas) {
    let spec = api.components.schemas[t];
    if(!spec.properties)
      continue;
    for(let k in spec.properties) {
      if(!spec.properties[k].description || spec.properties[k]['x-private'])
        delete spec.properties[k];
    }
  }

  let used_tags = {}
  for(let p in api.paths) {
    let path = api.paths[p];
    for(let m in path) {
      if(m == "parameters") {
        continue;
      }
      if(!path[m].description || path[m]['x-private']) {
        delete path[m];
        continue;
      }
      (path[m].tags || []).forEach((t) => used_tags[t] = true);

      let k = 0;
      if(path[m].parameters) {
        while(k < path[m].parameters.length) {
          if(!path[m].parameters[k].description || path[m].parameters[k]['x-private']) {
            path[m].parameters.splice(k,1);
          } else {
            k++;
          }
        }
      }
    }
    if(Object.keys(path).length == 0)
      delete api.paths[p];
  }
  api.tags = api.tags.filter(({name}) => used_tags[name])
  return api;
}



function spec_dependencies(spec) {
  if(!spec) return [];
  let a1 = (spec.allOf || []).flatMap((e) => spec_dependencies(e));
  let a2 = (spec.anyOf || []).flatMap((e) => spec_dependencies(e));
  let a3 = spec.items ? spec_dependencies(spec.items) : [];
  let a4 = spec['$ref'] ? [spec['$ref'].replace('#/components/schemas/','')] : [];
  let a5 = spec.additionalProperties && spec.additionalProperties['$ref'] ?
    [spec.additionalProperties['$ref'].replace('#/components/schemas/','')] : [];
  let a6 = spec.properties ? Object.keys(spec.properties).flatMap((p) => spec_dependencies(spec.properties[p])) : [];
  let a7 = spec.format ? [spec.format] : [];
  let a8 = (spec.oneOf || []).flatMap((e) => spec_dependencies(e));
  let a9 = spec['x-key-type'] && spec['x-key-type'] != 'string' ? [spec['x-key-type']] : [];

  let deps = a1.concat(a2).concat(a3).concat(a4).concat(a5).concat(a6).concat(a7).concat(a8).concat(a9);
  let deps_map = {};
  deps.forEach((n) => {
    deps_map[n] = true;
  })
  return Object.keys(deps_map).sort();
}


function response_schema(response) {
  if(!response) return false;
  if(!response.content) return false;

  // FIXME: remove ASAP, this is a hack for iris
  if(response.content['soap/xml'] && response.content['soap/xml'].schema)
    return response.content['soap/xml'].schema;
  if(!response.content['application/json']) return false;
  return response.content['application/json'].schema;
}

function request_schema(request) {
  if(!request) return false;
  if(!request.content) return false;
  if(!request.content['application/json']) return false;
  return request.content['application/json'].schema;
}

function remove_orphan_schemas(api0) {
  let api = JSON.parse(JSON.stringify(api0));

  // FIXME: here live hacks for different projects
  let used_schemas = {
    person_upload_image_request: true, // watcher-v2
    attachment_upload: true, // talks
  };
  for(let p in api.paths) {
    for(let m in api.paths[p]) {
      if(m == "parameters") {
        continue;
      }
      let desc = api.paths[p][m];
      spec_dependencies(request_schema(desc.requestBody)).forEach((d) => {
        used_schemas[d] = true;
      });
      for(let code in (desc.responses || {})) {
        let dependencies = spec_dependencies(response_schema(desc.responses[code]));
        dependencies.forEach((d) => {
          used_schemas[d] = true;
        })
        // console.log(`ADD ${method} ${path} ${util.inspect(response_schema(desc.responses[code]))}: ${dependencies}`)
      }
    }
  }
  let visit = (name) => {
    let dependencies = spec_dependencies(api.components.schemas[name]).filter((d) => !used_schemas[d])
    dependencies.forEach((d) => used_schemas[d] = true);
    dependencies.forEach((d) => visit(d))
  }
  Object.keys(used_schemas).forEach((d) => visit(d))

  for(let n in api.components.schemas) {
    if(!used_schemas[n]) {
      delete api.components.schemas[n];
    }
  }
  return api;
}

function unref_response(response) {
  let schema = response_schema(response);
  if(!schema || !schema['$ref']) return false;
  return schema['$ref'].replace("#/components/schemas/","");
}


function fill_collection_types(api) {
  for(let path in api.paths) {
    for(let method in api.paths[path]) {
      if(method == "parameters") {
        continue;
      }
      let desc = api.paths[path][method];

      // Мы пытаемся найти на какой конфиг ссылается response на этот метод,
      // чтобы эвристически догадаться, какую коллекцию представляет этот метод на тот
      // случай, если это наш классический GET
      let response_type = unref_response((desc.responses || {})[200]);
      let collection_type = undefined;
      let collection_name = undefined;

      function find_collection_type(props) {
        if(!props) return false;
        for(let k in props) {
          if(props[k].type == "array" && props[k].items['$ref']) {
            return {name: k, type: props[k].items['$ref'].replace("#/components/schemas/","")};
          }
        }
        return false;
      }

      if(response_type && api.components.schemas[response_type] && desc.operationId.indexOf("_list") > 0) {
        let ct = find_collection_type(api.components.schemas[response_type].properties);
        if(ct) {
          collection_type = ct.type;
          collection_name = ct.name;
        } else {
          if(api.components.schemas[response_type].allOf) {
            api.components.schemas[response_type].allOf.forEach((all) => {
              if(all.properties) {
                ct = find_collection_type(all.properties);
                if(ct) {
                  collection_type = ct.type;
                  collection_name = ct.name;
                }
              }
            })
          }
        }

        let props = api.components.schemas[response_type].properties;
      }
      // if(collection_type) console.log(`FOUND ${desc.operationId} ${response_type} ${collection_name} ${collection_type}`);
      desc['x-collection-type'] = collection_type;
      desc['x-collection-name'] = collection_name;
    }
  }
}


function fill_api(api0) {
  let api = JSON.parse(JSON.stringify(api0));
  Object.keys(api.components.schemas).sort().forEach((k) => {
    let spec = api.components.schemas[k];
    spec.dependencies = spec_dependencies(spec);
  });
  fill_collection_types(api);
  return api;
}




function public_api(full_api) {
  return remove_orphan_schemas(make_public_api(full_api));
}

async function load_api(path, scope) {

  // Старый вотчер не хочется трогать вообще. Там всё через пень-колоду
  let api = (path.indexOf("watcher-v2") != -1 ||
    path.indexOf("iris/") != -1) ?
    await OpenAPIParser.bundle(path) :
    await bundle(path);

  // // Этот отладочный вывод здорово помогает. Не стирай его
  // fs.writeFileSync("out.json", JSON.stringify(api));
  // await exec("cat out.json | jq > out1.json ; mv -f out1.json out.json")

  let refs_to_delete = [];
  for(let t in api.components.schemas) {
    let spec = api.components.schemas[t];
    if(spec['x-scope'] && !spec['x-scope'].includes(scope)) {
      refs_to_delete.push(t)
      delete api.components.schemas[t];
      continue;
    }
    delete spec['x-scope'];
    if(!spec.properties)
      continue;
  }

  function look_inside(spec) {
    if (spec.properties)
      Object.values(spec.properties).forEach(look_inside);
    ['oneOf', 'allOf', 'anyOf']
      .filter((of) => Array.isArray(spec[of]))
      .forEach((of) => {
        spec[of] = spec[of].filter((item) => {
          if (!item["$ref"])
            return true;

          const ref = item["$ref"].match(/#\/components\/schemas\/(\w+)/);
          return !refs_to_delete.includes(ref[1]);
        });
      });
  }
  if (refs_to_delete.length)
    Object.values(api.components.schemas).forEach(look_inside);

  clear_api_scope(api, scope);
  clear_api_fields(api, scope);
  return remove_orphan_schemas(api);
}

function collect_metrics(api0) {
  let api = JSON.parse(JSON.stringify(api0));
  let metrics = {
      "properties_total" : 0,
      "properties_private" : 0,
      "properties_no_description" : 0,
      "properties_no_example" : 0,
      "properties_private_list" : [],
      "properties_no_description_list" : [],
      "properties_no_example_list" : [],
  }
  let openmetrics_labels = new Set();
  let openmetrics_metrics = new Set();
  for(let t in api.components.schemas) {
    let spec = api.components.schemas[t];
    if(!spec.properties)
      continue;
    for(let k in spec.properties) {
      metrics["properties_total"] += 1;
      if (spec.properties[k]["description"] == undefined) {
          metrics["properties_no_description"] += 1;
          metrics["properties_no_description_list"].push(k);
      }
      if (spec.properties[k]["example"] == undefined) {
          metrics["properties_no_example"] += 1;
          metrics["properties_no_example_list"].push(k);
      }
      if (spec.properties[k]["x-private"] !== undefined) {
          metrics["properties_private"] += 1;
          metrics["properties_private_list"].push(k);
      }
      if (spec.properties[k]["openmetrics_label"] !== undefined) {
          openmetrics_labels.add(spec.properties[k]["openmetrics_label"])
      }
      if (spec.properties[k]["openmetrics_metric"] !== undefined) {
          openmetrics_metrics.add(spec.properties[k]["openmetrics_metric"])
      }
    }
  }

  if (openmetrics_metrics.size > 0){
      metrics["openmetrics"] = {
          "openmetrics_labels_total": openmetrics_labels.size,
          "openmetrics_metrics_total": openmetrics_metrics.size,
          "openmetrics_labels_list": [...openmetrics_labels],
          "openmetrics_metrics_list": [...openmetrics_metrics],
      }
  }

  return metrics;
}

export {
  load_api,
  public_api,
  collect_metrics,

  spec_dependencies,
  response_schema,
  remove_orphan_schemas,
  fill_collection_types,
};
