#!/usr/bin/env node


import api_validator from './lib/validator.js';
import util from 'util';
import process from 'process';
import fs from 'fs';
import path from 'path';

import {
  public_api,
  load_api,
  collect_metrics,
} from './lib/api.mjs';

function validate_typespec(name_path, spec, errors) {
  if(spec.properties) {
    for(let name in spec.properties) {
      validate_typespec(name_path.concat([name]), spec.properties[name], errors);
    }
  }
}

function validate_watcher_operation(name_path, operation, errors) {
  let method = name_path.slice(-1)[0];

  const snake_case_naming = (name) => !(/^[a-z][a-z0-9]+(_[a-z0-9]+)*$/.test(name))
  const method_suffix_mismatch = (operationId) => {
    if (!operationId) return true;
    const allowed_suffixes = {
      'get': ['list', 'get', 'export'],
      'put': ['change', 'save'],
      'delete': ['delete', 'disable']
    };
    let suffix = operationId.split('_').slice(-1)[0];
    // разрешил тут post, так как на него вот прям много разных вариантов названий получается
    return method != 'post' && allowed_suffixes[method].indexOf(suffix) < 0;
  }
  const required = (name) => !name
  const push_bad = (arg, title, tests) => {
    const arg_errors = tests
      .map(fn => fn(arg) ? fn.name : false)
      .filter(it => it !== false)
      .filter(it => (operation['x-nolint'] || []).indexOf(it) < 0 );

    if (0 < arg_errors.length) {
      errors.push(`${name_path}: ${title} ${arg_errors} (${arg})`)
    }
  }

  push_bad(operation.operationId, 'operationId', [required, snake_case_naming, method_suffix_mismatch]);
  push_bad(operation.responses, 'responses', [required]);
  const response_suffix = (name) => !name.endsWith('_response')
  const response_schema_name = (name) => {
    if (operation.operationId.endsWith('_list') && method == 'get')
      return !`${operation.operationId}_response`.endsWith(name)
    if (operation.operationId.endsWith('_get') && method == 'get')
      return !`${operation.operationId.replace('_get', '')}_response`.endsWith(name)
    return false;
  }
  for (let code in (operation.responses || {})){
    const delete_204 = (_) => method == 'delete' && code != 204;
    push_bad(operation.operationId, 'response code', [delete_204]);

    if (code != 204)
      push_bad(operation.responses[code].content, 'response content', [required]);

    if (!operation.responses[code].content)
      continue;
    if (operation.responses[code].content['application/octet-stream'])
      continue;
    if (operation.responses[code].content['text/plain'])
      continue;
    if (operation.responses[code].content['text/csv'])
      continue;
    if (operation.responses[code].content['image/jpeg'])
      continue;

    const ref = operation.responses[code].content['application/json'].schema['$ref']
    if (!ref)
      continue;

      const model_name = ref.split('/').slice(-1)[0];
    push_bad(model_name, 'response model name', [snake_case_naming, response_suffix, response_schema_name]);
  }
}

function validate_api_typespecs(api, errors) {
  for(let name in api.components.schemas) {
    let spec = api.components.schemas[name];
    validate_typespec([name], spec, errors);
  }
}

function validate_watcher_api_operations(api, errors) {
  for(let name in api.paths) {
    let path = api.paths[name]
    for(let method in path) {
      if (method == 'parameters') continue;
      let operation = path[method];
      validate_watcher_operation([name, method], operation, errors);
    }
  }
}

function organize_linter_items(items) {
  return items
    .map(({path: p, ...rest}) => { return {...rest, path: p.join ? p.join('.') : p}})
    .map((it) => { return {...it, $key: `${it.rule}: ${it.message}`}})
    .sort(({$key: a}, {$key: b}) => a.localeCompare(b))
    .reduce((acc, it) => {
      let prev = acc.slice(-1)[0];
      let $first = prev.$key != it.$key;
      let new_it = {...it, $idx: $first ? 0 : prev.$idx+1};
      if ($first) {
        prev.$last = true;
        new_it.$first = true;
      }
      acc.push(new_it);
      return acc;
    }, [{$key: null, $idx: 0}])
    .slice(1)
}

async function lint_schema(api, opts){
  let {errors = [], warnings = []} = await api_validator(api, opts);
  const display_limit = opts.display_limit || 5;
  if(errors.length > 0) {
    organize_linter_items(errors)
    .filter(({$idx, $last}) => $idx < display_limit || $last)
    .forEach(({$first, $last, $idx, $key, path}) => {
      $first && console.error(`\n(E) ${$key}`);
      $last && $idx >= display_limit && console.error(`... ${ $idx } items total`);
      console.error(`  ${path}`);
    })
  }
  organize_linter_items(warnings)
    .filter(({$idx, $last}) => $idx < display_limit || $last)
    .forEach(({$first, $last, $idx, $key, path}) => {
      $first && console.error(`\n(W) ${$key}`);
      $last && $idx >= display_limit && console.error(`... ${ $idx } items total`);
      console.error(`  ${path}`);
    })
  return {errors: errors.concat(warnings), warnings: []};
}

async function validate(spec_path, opts) {
  try {
    if(!opts.project) {
      opts.project = path.parse(spec_path).name;
    }
    await validate0(spec_path, opts);
  } catch (err) {
    console.error(util.inspect(err,{depth: 10}));
    process.exit(1);
  }
}

async function validate0(spec_path, opts) {
  let api2 = await load_api(spec_path, opts.project);
  if(api2 && api2.info && opts.version){
    api2.info.version = opts.version;
  }

  let paths = Object.keys(api2.paths)
  console.log("API name: %s, Version: %s, %d methods", api2.info.title, api2.info.version, paths.length);
  let errors = []
  validate_api_typespecs(api2, errors);
  opts.validate_watcher_operations && validate_watcher_api_operations(api2, errors);

  if(errors.length > 0) {
    errors.forEach((e) => console.error(`${e}`));
    console.warn(errors.length, 'errors')
    process.exit(6)
  }
  let {errors: lint_errors} = await lint_schema(api2, Object.assign({display_limit: 5},opts));

  if(lint_errors.length > 0) {
    lint_errors.forEach((e) => console.error(`${util.inspect(e)}`));
    console.warn(lint_errors.length, 'errors')
    process.exit(7)
  }
  if(opts.schema) {
    fs.writeFileSync(opts.schema, JSON.stringify(api2, null, 2), (err) => {
      if (err) throw err;
    });
  }
  if(opts.public_schema) {
    fs.writeFileSync(opts.public_schema, JSON.stringify(public_api(api2), null, 2), (err) => {
      if (err) throw err;
    });
  }
  if(opts.metrics) {
    fs.writeFileSync(opts.metrics, JSON.stringify(collect_metrics(api2), null, 2), (err) => {
      if (err) throw err;
    });
  }
}

async function run(){
  fs.mkdirSync('html/private/metrics', { recursive: true });

  if(process.argv.indexOf('openapi/flussonic/flussonic.yml') != -1) {
    await validate('openapi/flussonic/flussonic.yml', {
      schema: 'html/private/flussonic.json',
      public_schema: 'html/flussonic-public.json',
      metrics: 'html/private/metrics/metrics-flussonic.json',
      version: process.env['FLUSSONIC_VERSION']
    });
  }

  if(process.argv.indexOf('openapi/flussonic/chassis.yml') != -1) {
    await validate('openapi/flussonic/chassis.yml', {
      schema: 'html/private/chassis.json',
      version: process.env['FLUSSONIC_VERSION']
    });
  }

  if(process.argv.indexOf('openapi/flussonic/auth-backend.yml') != -1) {
    await validate('openapi/flussonic/auth-backend.yml', {
      schema: 'html/private/auth-backend.json',
      public_schema: 'html/auth-backend-public.json',
      metrics: 'html/private/metrics/metrics-auth-backend.json'
    });
  }
  if(process.argv.indexOf('openapi/flussonic/config-external.yml') != -1) {
    await validate('openapi/flussonic/config-external.yml', {
      schema: 'html/config-external-public.json',
      metrics: 'html/private/metrics/metrics-config-external.json'
    });
  }
  if(process.argv.indexOf('openapi/flussonic/coder-updater.yml') != -1) {
    await validate('openapi/coder-updater/coder-updater.yml', {
      schema: 'html/private/coder-updater.json',
      metrics: 'html/private/metrics/metrics-coder-updater.json'
    });
  }
  if(process.argv.indexOf('openapi/watcher/watcher.yml') != -1) {
    await validate('openapi/watcher/watcher.yml', {
      project: "watcher",
      schema: 'html/private/watcher.json',
      public_schema: 'html/watcher.json',
      metrics: 'html/private/metrics/metrics-watcher.json',
      version: process.env['WATCHER_VERSION']
    });
  }
  if(process.argv.indexOf('openapi/watcher/client.yml') != -1) {
    await validate('openapi/watcher/client.yml', {
      project: "watcher-client",
      schema: 'html/private/watcher-client.json',
      public_schema: 'html/watcher-client-public.json',
      metrics: 'html/private/metrics/metrics-watcher-client.json',
      version: process.env['FLUSSONIC_VERSION']
    });
  }
  if(process.argv.indexOf('openapi/flussonic/central.yml') != -1) {
    await validate('openapi/flussonic/central.yml', {
      schema: 'html/private/central.json',
      public_schema: 'html/central-public.json',
      metrics: 'html/private/metrics/metrics-central.json',
      version: process.env['FLUSSONIC_VERSION']
    });
  }
  if(process.argv.indexOf('watcher-core') != -1) {
    await validate('openapi/flussonic/central.yml', {
      project: "watcher-core",
      schema: 'html/watcher-core.json',
      metrics: 'html/private/metrics/metrics-watcher-core.json',
      version: process.env['FLUSSONIC_VERSION']
    });
  }
  if(process.argv.indexOf('openapi/flussonic/cloud.yml') != -1) {
    await validate('openapi/flussonic/cloud.yml', {
      project: "cloud",
      schema: 'html/private/cloud.json',
      public_schema: 'html/cloud-public.json',
      metrics: 'html/private/metrics/metrics-cloud.json',
      version: process.env['FLUSSONIC_VERSION']
    });
  }
  if(process.argv.indexOf('openapi/flussonic/cloud-internal.yml') != -1) {
    await validate('openapi/flussonic/cloud-internal.yml', {
      project: "cloud",
      schema: 'html/private/cloud-internal.json',
      metrics: 'html/private/metrics/metrics-cloud-internal.json'
    });
  }
  if (process.argv.indexOf('openapi/flussonic/cloud-auth-backend.yml') != -1) {
    await validate('openapi/flussonic/cloud-auth-backend.yml', {
      schema: 'html/private/cloud-auth-backend.json',
      public_schema: 'html/cloud-auth-backend-public.json',
      metrics: 'html/private/metrics/metrics-cloud-auth-backend.json'
    });
  }
  if(process.argv.indexOf('openapi/flussonic/streaming.yml') != -1) {
    await validate('openapi/flussonic/streaming.yml', {
      schema: 'html/private/streaming.json',
      public_schema: 'html/streaming-public.json',
      metrics: 'html/private/metrics/metrics-streaming.json',
      version: process.env['FLUSSONIC_VERSION']
    });
  }
  if(process.argv.indexOf('openapi/vision/vision.yml') != -1) {
    await validate('openapi/vision/vision.yml', {
      project: "vision",
      public_schema: 'html/vision.json',
      schema: 'html/private/vision.json',
      metrics: 'html/private/metrics/metrics-vision.json',
      version: process.env['VISION_VERSION']
    });
  }
  if(process.argv.indexOf('openapi/vision/identification.yml') != -1) {
    await validate('openapi/vision/identification.yml', {
      project: "vision",
      public_schema: 'html/vision-identification.json',
      schema: 'html/private/vision-identification.json',
      metrics: 'html/private/metrics/metrics-vision-identification.json',
      version: process.env['VISION_VERSION']
    });
  }
  if(process.argv.indexOf('openapi/vision/vision-config-external.yml') != -1) {
    await validate('openapi/vision/vision-config-external.yml', {
      schema: 'html/vision-config-external-public.json',
      metrics: 'html/private/metrics/metrics-vision-config-external.json'
    });
  }
  if(process.argv.indexOf('openapi/bss-auth/bss-auth.yml') != -1) {
    await validate('openapi/bss-auth/bss-auth.yml', {
      project: "bss-auth",
      schema: 'html/private/bss-auth.json',
      metrics: 'html/private/metrics/metrics-bss-auth.json'
    });
  }
  if(process.argv.indexOf('openapi/billing/billing-client.yml') != -1) {
    await validate('openapi/billing/billing-client.yml', {
      project: "billing-client",
      schema: 'html/private/billing-client.json',
      metrics: 'html/private/metrics/metrics-billing-client.json'
    });
  }
  if(process.argv.indexOf('openapi/billing/billing.yml') != -1) {
    await validate('openapi/billing/billing.yml', {
      project: "billing",
      schema: 'html/private/billing.json',
      metrics: 'html/private/metrics/metrics-vision-identification.json'
    });
  }
  if(process.argv.indexOf('openapi/payments/api.yml') != -1) {
    await validate('openapi/payments/api.yml', {
      project: "payments",
      schema: 'html/private/payments.json',
      metrics: 'html/private/metrics/metrics-payments.json'
    });
  }
  if(process.argv.indexOf('openapi/sigur/sigur.yml') != -1) {
    await validate('openapi/sigur/sigur.yml', {
      schema: 'html/private/sigur.json',
    });
  }
  if(process.argv.indexOf('openapi/protocollum/protocollum.yml') != -1) {
    await validate('openapi/protocollum/protocollum.yml', {
      schema: 'html/private/protocollum.json',
      metrics: 'html/private/metrics/metrics-protocollum.json'
    });
  }
  if(process.argv.indexOf('openapi/talks/talks.yml') != -1) {
    await validate('openapi/talks/talks.yml', {
      project: "talks",
      schema: 'html/private/talks.json',
      metrics: 'html/private/metrics/metrics-talks.json'
    });
  }
  if(process.argv.indexOf('openapi/omnifications/omnifications.yml') != -1) {
    await validate('openapi/omnifications/omnifications.yml', {
      project: "omnifications",
      schema: 'html/private/omnifications.json',
      metrics: 'html/private/metrics/metrics-omnifications.json'
    });
  }
  if(process.argv.indexOf('openapi/client-area/client-area.yml') != -1) {
    await validate('openapi/client-area/client-area.yml', {
      project: "client-area",
      schema: 'html/private/client-area.json',
      metrics: 'html/private/metrics/metrics-client-area.json'
    });
  }
}

run();
