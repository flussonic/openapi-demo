function validateObject(path, name, type_definition, errors) {
  
  if (type_definition.anyOf) {
    const items = type_definition.anyOf;
    for (let item of items) {
      if (item.const) {
        errors.push({ path, message: ` anyOf item contains a constant` })
      }
    }
  }
  if (type_definition.type == 'object') {
    for (prop_name in type_definition.properties) {
      const prop = type_definition.properties[prop_name];
      validateObject([...path, 'properties', prop_name], prop_name, prop, errors);
    }
  }
  if (type_definition.type == 'array') {
    for (prop_name in type_definition.properties) {
      const items = type_definition.items;
      validateObject([...path, 'properties', prop_name], prop_name, items, errors);
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
  for (type_name in schema){
    type_definition = schema[type_name];
    validateObject([...path, type_name], type_name, type_definition, errors);
  }
  return errors;
};

module.exports = {
    description: 'anyOf cannot contain a constant',
    message: '{{error}}',
    given: '$.components.schemas',
    severity: 'warn',
    resolved: true,
    then: {
      function: validate
    }
  }
  