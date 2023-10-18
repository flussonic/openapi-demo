

function clear_api_scope(api, scope)
{
  for(let path in api.paths) {
    for(let method in api.paths[path]) {
      if(method == "parameters") {
        continue;
      }
      let desc = api.paths[path][method];
      if(desc['x-scope'] && !desc['x-scope'].includes(scope)) {
        delete api.paths[path][method];
      }
      delete desc['x-scope'];
    }
  }
}

function clear_api_fields(api, scope)
{
  for(let name in api.components.schemas) {
    recursive_clear_api_fields(api.components.schemas[name], scope, api);
  }
  let used_tags = {};
  for(let op in api.paths) {
    for(let meth in api.paths[op]) {
      let spec = api.paths[op][meth];
      if(spec['x-api-deny'] && spec['x-api-deny'].includes(scope)) {
        delete api.paths[op][meth];
      } else {
        (api.paths[op][meth].tags || []).forEach((tag) => used_tags[tag] = true);
      }
    }
  }
  api.tags = api.tags.filter((desc) => used_tags[desc.name]);
}

function planar_properties(spec,api)
{
  if(spec['$ref']) {
    let spec2 = api.components.schemas[[spec['$ref'].replace('#/components/schemas/','')]];
    return spec2 ? planar_properties(spec2,api) : {};
  }
  let a1 = [spec.properties || {}];
  let a2 = (spec.allOf || []).flatMap((e) => planar_properties(e,api));
  let a3 = (spec.anyOf || []).flatMap((e) => planar_properties(e,api));
  let a4 = a1.concat(a2).concat(a3);
  return a4.reduce((acc,val) => Object.assign(acc,val), {});
}

function planar_delete(spec, field, api)
{
  if(spec['$ref']) {
    let spec2 = api.components.schemas[[spec['$ref'].replace('#/components/schemas/','')]];
    if(spec2) planar_delete(spec2, field, api);
  }
  if(spec.properties && spec.properties[field]) {
    delete spec.properties[field];
    return;
  }
  (spec.allOf || []).forEach((e) => planar_delete(e, field,api));
  (spec.anyOf || []).forEach((e) => planar_delete(e, field,api));
}

function recursive_clear_api_fields(spec, scope, api)
{
  let has_api_whitelist = false;
  let obj = planar_properties(spec,api);

  for(let field in obj) {
    if(obj[field]['x-scope'] && !obj[field]['x-scope'].includes(scope)) {
      planar_delete(spec, field, api);
    } else {
      delete obj[field]['x-scope'];
    }
  }

  for(let field in obj) {
    if(obj[field]['x-api-allow'] && obj[field]['x-api-allow'].includes(scope)) {
      has_api_whitelist = true;
      break;
    }
  }
  if(has_api_whitelist) {
    for(let field in obj) {
      if(!obj[field]['x-api-allow'] || !obj[field]['x-api-allow'].includes(scope)) {
        planar_delete(spec, field, api);
      }
      delete obj[field]['x-api-deny'];
    }
  } else {
    for(let field in obj) {
      if(obj[field]['x-api-deny'] && obj[field]['x-api-deny'].includes(scope)) {
        planar_delete(spec, field, api);
      }
      delete obj[field]['x-api-deny'];
    }
  }
}

export {
  clear_api_scope,
  clear_api_fields,
};
