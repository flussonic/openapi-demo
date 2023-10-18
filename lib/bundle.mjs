import {promises as fs} from 'fs';
import yaml, { JSON_SCHEMA } from 'js-yaml';
import util from 'util';
import path from 'path';


// Это очень сокращенный бандлер схемы.
// Его пришлось писать самому, потому что SwaggerParser.bundle очень сложный, запутанный,
// много чего может, а чего нужно не может.
//
// Главная проблема в том, что когда из одного проекта (например openapi/iris) втаскиваешь схемы из соседнего,
// например openapi/flussonic, то эти схемы не импортируются в #/components/schemas/type_name, а
// втыкаются куда попало в #/paths/~dvrs_list/get/responses/....
//
// В итоге каша, и оно не сходится.
//
// Вместо этого сделано очень просто: если видим ссылку на схему в paths, то сразу меняем её на #/components/schemas/...
// а дальше пусть валидатор проверяет.
//
// Аналогично в schemas. Мы пройдем по реальному пути и загрузим, но все схемы будут вставлены не в то место,
// где они встретились, а в верхнеуровневый components.schemas по ссылке.
//
// Из-за того, что мы руками не загружаем все-все схемы в общий котел следует одно важное, но довольно простое и
// даже полезное допущение: автор схем должен руками импортировать все типы в свои схемы, автолоад может не случиться


async function read_file(path) {
  const data = await fs.readFile(path, "utf8");
  try {
    return yaml.load(data, { schema: JSON_SCHEMA });
  } catch (e) {
    throw new Error(`${path}:\n${e.message}`, path);
  }
}


async function load_paths(api, cwd) {
  for(let p in api.paths) {
    if(api.paths[p].$ref) {
      let description_file = path.join(cwd, api.paths[p].$ref);
      api.paths[p] = await read_file(description_file);
    }

    for(let method in api.paths[p]) {
      // TODO: add passing tree of parameters schema
      if(method == "parameters") continue;

      let operation = api.paths[p][method];

      for(let key in (operation.parameters || {})) {
        if(!operation.parameters[key].schema) continue;

        let value = operation.parameters[key].schema;
        unref_one_schema(value, api.components.schemas, cwd);
        // if(value.$ref && value.$ref[0] != '#') {
        //   value.$ref = `#/components/schemas/${value.$ref.split("#/")[1]}`
        // }
      }

      for(let code in (operation.responses || {})) {
        for(let content_type in (operation.responses[code].content || {})) {
          if(!operation.responses[code].content[content_type].schema) continue;

          let resp = operation.responses[code].content[content_type].schema;

          unref_one_schema(resp, api.components.schemas, cwd);
          // if(resp.$ref && resp.$ref[0] != '#') {
          //   resp.$ref = `#/components/schemas/${resp.$ref.split("#/")[1]}`
          // }
        }
      }

      if(operation.requestBody) {
        for(let content_type in (operation.requestBody.content || {})) {
          if(!operation.requestBody.content[content_type].schema) continue;
          let req = operation.requestBody.content[content_type].schema;
          unref_one_schema(req, api.components.schemas, cwd);
          // if(req.$ref && req.$ref[0] != '#') {
          //   req.$ref = `#/components/schemas/${req.$ref.split("#/")[1]}`
          // }

        }
      }
    }
  }
}

async function load_schemas(api, cwd) {
  if(!api.components) return;
  if(!api.components.schemas) return;
  if(api.components.schemas.$ref) {
    let schema_file = path.join(cwd, api.components.schemas.$ref);
    api.components.schemas = await read_file(schema_file);
    cwd = path.dirname(schema_file);
  }

  for(let t in api.components.schemas) {
    let cwd1 = await load_one_schema(api.components.schemas[t], api.components.schemas, cwd)
    if (cwd1) {
      await unref_one_schema(api.components.schemas[t], api.components.schemas, cwd1)
    }
  }
}

async function load_one_schema(schema, schemas, cwd) {
  let hops = 0;
  while(schema.$ref && schema.$ref[0] != '#') {
    if(hops >= 10) {
      throw new Error(`${cwd}: ${t} too many references`);
    }
    let subtype = schema.$ref.indexOf("#") == -1 ?
      undefined :
      schema.$ref.split("#/")[1];
    let schema_file = path.join(cwd, schema.$ref.split("#")[0]);
    let content = await read_file(schema_file);
    let new_content = subtype ? content[subtype] : content; // Прямая загрузка целого файла или ссылка на чужую схему
    cwd = path.dirname(schema_file);

    Object.keys(schema).forEach((k) => delete schema[k]);
    if (!new_content) {
      console.log(`FAILED TO LOAD ${subtype} from ${schema_file}`);
      Object.assign(schema, {$ref: `#/components/schemas/${subtype}`});
      return false;
    }
    Object.assign(schema, new_content);
    hops = hops+1;
  }
  return cwd;
}

async function unref_one_schema(schema, schemas, cwd) {
  if(schema.$ref) {
    let subtype = schema.$ref.indexOf("#") == -1 ?
      undefined :
      schema.$ref.split("#/")[1];
    if(!subtype) {
      throw Error(`in ${cwd}/...yml failed to load ${util.inspect(schema)}`);
    }
    if(!schemas[subtype]) {
      let loaded_schema = {$ref: schema.$ref};
      let new_cwd = await load_one_schema(loaded_schema, schemas, cwd);
      if (new_cwd) {
        cwd = new_cwd;
        schemas[subtype] = loaded_schema;
        await unref_one_schema(loaded_schema, schemas, cwd);
      }
    }
    schema.$ref = `#/components/schemas/${subtype}`
  }

  for(let k in (schema.properties || {})) {
    await unref_one_schema(schema.properties[k], schemas, cwd);
  }
  if(schema.allOf) {
    for(let i = 0; i < schema.allOf.length; i++) {
      await unref_one_schema(schema.allOf[i], schemas, cwd);
    }
  }
  if(schema.oneOf) {
    for(let i = 0; i < schema.oneOf.length; i++) {
      await unref_one_schema(schema.oneOf[i], schemas, cwd);
    }
  }
  if(schema.anyOf) {
    for(let i = 0; i < schema.anyOf.length; i++) {
      await unref_one_schema(schema.anyOf[i], schemas, cwd);
    }
  }
  if(schema.items) {
    await unref_one_schema(schema.items, schemas, cwd);
  }
  if(schema.additionalProperties) {
    await unref_one_schema(schema.additionalProperties, schemas, cwd);
  }
  if(schema['x-default']) {
    await unref_one_schema(schema['x-default'], schemas, cwd);
  }
}



async function bundle(schema_path) {
  let api = await read_file(schema_path);
  await load_schemas(api, path.dirname(schema_path));
  await load_paths(api, path.dirname(schema_path));
  return api;
}


export {
  bundle
};