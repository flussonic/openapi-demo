const { oas3 } = require('@stoplight/spectral-formats');

function validateJsonapiErrorSchema(errorResponseSchema, _opts, { path }) {
  const errors = [];
  if (!schemaIsObjectWithProperties(errorResponseSchema)) {
    return [
      {
        message: 'Error response should be an object with properties',
        path: path
      }
    ];
  } else {
    errors.push(...validateErrorResponseProperties(errorResponseSchema, path));
  }
  return errors;
};


function validateErrorResponseProperties(errorResponseSchema, pathToSchema) {
  const errors = [];
  const errorResponseProperties = errorResponseSchema.properties;
  const pathToProperties = [...pathToSchema, 'properties'];
  // if (!hasTraceField(errorResponseProperties)) {
  //   errors.push({
  //     message: 'Error response should have a uuid `trace` field',
  //     path: [...pathToProperties, 'trace']
  //   });
  // }
  if (errorResponseProperties.errors) {
    // validate `errors` is error model container
    if (errorResponseProperties.errors.type !== 'array') {
      errors.push({
        message: '`errors` field should be an array of error models',
        path: [...pathToProperties, 'errors']
      });
    } else {
      // `errors` is error model container, so validate the items
      // are valid error models
      errors.push(
        ...validateErrorModelSchema(errorResponseProperties.errors.items, [
          ...pathToProperties,
          'errors',
          'items'
        ])
      );
    }
  } else {
    errors.push({
      message: 'MUST have an `errors` field with array of errors',
      path: [...pathToProperties, 'errors']
    });
  }
  return errors;
}

function validateErrorModelSchema(errorModelSchema, pathToSchema) {
  const errors = [];
  if (!schemaIsObjectWithProperties(errorModelSchema)) {
    errors.push({
      message: 'Error Model should be an object with properties',
      path: pathToSchema
    });
  } else {
    // error model has properties, validate the properties
    if (!hasCodeField(errorModelSchema.properties)) {
      errors.push({
        message:
          'Error Model should contain `code` field, a snake-case, string error code',
        path: [...pathToSchema, 'properties', 'code']
      });
    }
    if (!hasTitleField(errorModelSchema.properties)) {
      errors.push({
        message: 'Error Model should contain a string, `title`, field',
        path: [...pathToSchema, 'properties', 'title']
      });
    }
    if (!hasValidMetaField(errorModelSchema.properties)) {
      errors.push({
        message:
          'Error Model may contain `meta` field of type `object` for keeping meta information',
        path: [...pathToSchema, 'properties', 'meta']
      });
    }
  }
  return errors;
}

function validStatusCodeField(errorResponseProperties) {
  // valid if no status_code provided or if the provided status_code is an integer
  return (
    !errorResponseProperties.status_code ||
    errorResponseProperties.status_code.type === 'integer'
  );
}

function hasCodeField(errorModelSchemaProperties) {
  return (
    errorModelSchemaProperties.code &&
    errorModelSchemaProperties.code.type === 'string'
  );
}

function hasTitleField(errorModelSchemaProperties) {
  return (
    errorModelSchemaProperties.title &&
    errorModelSchemaProperties.title.type === 'string'
  );
}

function hasValidMetaField(errorModelSchemaProperties) {
  return (
    errorModelSchemaProperties.meta ?
      errorModelSchemaProperties.meta.type === 'object' :
      true
  );
}

function hasTraceField(errorResponseProperties) {
  return (
    errorResponseProperties.trace &&
    errorResponseProperties.trace.type === 'string'
  );
}

function schemaIsObjectWithProperties(errorResponseSchema) {
  return !!errorResponseSchema.properties;
}




module.exports = {
  description: 'Error response should follow design guidelines',
  message: '{{error}}',
  given: '$.paths[*][*].responses[?(@property >= 400 && @property < 600)].content[*].schema',
  severity: 'warn',
  // formats: [oas3],
  resolved: true,
  then: {
    function: validateJsonapiErrorSchema
  }  
}