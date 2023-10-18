const { oas3 } = require('@stoplight/spectral-formats');

function validateObject(path, name, {type, properties, format}, errors) {
  if (typeof(type) === 'undefined') {
    return;
  }
  if (!properties)
    return;

  for (prop_name in properties){
    const prop = properties[prop_name];
    if (prop.type == 'object')
      validateObject([...path, 'properties', prop_name], prop_name, prop, errors);
    else if (prop.type == 'array')
      validateObject([...path, 'properties', prop_name, 'items'], prop_name, prop.items, errors);
    else
      validateProperty([...path, 'properties', prop_name], prop_name, prop, errors);
  }
}

const allowed_for_suffix = {
  _duration: {
    types: ['integer', 'number'],
    formats: ['seconds', 'milliseconds', 'ticks'],
  },
  _time: {
    types: ['integer', 'number'],
    formats: ['seconds', 'milliseconds'],
  },
  _timeout: {
    types: ['integer'],
    formats: ['milliseconds'],
  },
  _at: {
    types: ['integer', 'number'],
    formats: ['utc', 'utc_ms'],
  },
  _count: {
    types: ['integer', 'number'],
  },
  _path: {
    types: ['string'],
    formats: ['disk_path'],
  },
  // should we get rid of `speed` format?
  _bitrate: {
    types: ['integer'],
    formats: ['speed', 'bps'],
  },
  _bandwidth: {
    types: ['integer'],
    formats: ['speed', 'bps'],
  },
  _size: {
    types: ['integer'],
    formats: ['bytes'],
  },
}

function validateProperty(path, name, {type, format}, errors) {
  for (suffix in allowed_for_suffix){
    if (!name.endsWith(suffix)) { continue; }
    const allowed_formats = allowed_for_suffix[suffix].formats;
    const allowed_types = allowed_for_suffix[suffix].types;
    if (allowed_formats && allowed_formats.indexOf(format) < 0){
      errors.push({ path, message: `\`${suffix}\` suffixed field should have format \`${allowed_formats}\` but has \`${format}\`` })
    }
    if (type && allowed_types && allowed_types.indexOf(type) < 0){
      errors.push({ path, message: `\`${suffix}\` suffixed field should have type \`${allowed_types}\` but has \`${type}\`` })
    }
  }
}

function validate(schema, _opts, _arg) {
  try {
    return validate0(schema, _opts, _arg)
  } catch (err) {
    console.log(err);
    throw err;
  }
};


function validate0(schema, _opts, { path }) {
  const errors = [];
  const items = [];
  for (type_name in schema){
    type_definition = schema[type_name];
    type_base = type_definition.type;
    items.push()
  }

  for (type_name in schema){
    type_definition = schema[type_name];
    validateObject([...path, type_name], type_name, type_definition, errors);
  }
  return errors;
};



module.exports = {
  description: 'Property name suffix, type and format should follow design guidelines',
  message: '{{error}}',
  given: '$.components.schemas',
  severity: 'warn',
  // formats: [oas3],
  resolved: true,
  then: {
    function: validate
  }
}
