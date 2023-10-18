const ibmCloudValidationRules = require('@ibm-cloud/openapi-ruleset');                           // Note 1
const { propertyCaseConvention } = require('@ibm-cloud/openapi-ruleset/src/functions');
const { schemas } = require('@ibm-cloud/openapi-ruleset/src/collections');
const errorResponseSchema = require('./lib/error-response-schema-jsonapi.js');
const validAnyofContent = require('./lib/valid-anyof-content.js');
const propertyFormatNaming = require('./lib/property-format-naming.js');
const util = require('util');
const validateExamples = require("./lib/validate-examples.js");

const defaultRules = {
  // Warnings and errors that we will not change:

  // Places like `tc_size, format: hexcolor` use and will always use our custom formats.
  // It is not interesting, why don't IBM likes custom formats 
  'valid-type-format': false,

  // bm_display_mode has clauses like `Hp25` and it is ok. We don't care about IBM ideas on it
  'enum-case-convention': false,

  // Nice, but we've decided to be able to have things like `/cluster-public/info`
  'path-segment-case-convention': false,

  // We want to keep compatibility with properties like `pageUrl`, `swfUrl` and it is 
  // not interesting to translate them to anything else
  'property-case-convention': false,

  'property-description': true,
  'parameter-description': true,
  'operation-description': true,

  // event_sink_config.yml max_depth description mentions JSON. Do not want to rephrase them
  'description-mentions-json': false,


  // Here goes error handling block
  'response-error-response-schema': false,
  'jsonapi-error-response-schema': errorResponseSchema,
  // 'ibm-error-content-type-is-json': false, // logo_delete 404 content-type, once will do it
  'valid-anyof-content': validAnyofContent,
  'valid-examples': validateExamples,
};

const flussonicRules = {
  // Errors that may be will fix once
  'request-body-object': false, // config_put request body text/plain wants not a string, but object


  // Warnings that maybe will fix once:
  'accept-parameter': false, // config_get Accept
  'string-boundary': false, // all type: string declarations. It will take months to fullfill them
  'schema-description': false, // paths./streams.get.responses.200.content.application/json.schema  - impossible to do it
  'response-example-provided': false, // impossible to put all responses example
  'request-body-name': false, // thanks, but we will do another way
  'property-inconsistent-name-and-type': false,

  'pagination-style': false, // IBM wants next to be an object with href property. We see this as a string. TODO: add our own validation

  'operation-id-naming-convention': false, // IBM wants put to be replace, we use save. TODO: add our own rule

  'duplicate-path-parameter': false, // TODO: good idea to make it once
  'ibm-content-type-is-specific': false, // disk_file_put  content-type '*/*' is not what this rule wants to see

  'oas3-valid-schema-example': false, // "nullable" cannot be used without "type"', this cannot read through anyOf
};


module.exports = {
  rules: function(project, config) {
    let ruleset = Object.assign({}, defaultRules);
    Object.assign(ruleset, flussonicRules);

    if(project == "watcher") {
      Object.assign(ruleset, {
        'array-responses': false,
        'inline-response-schema': false, // Only 2 clauses, FIXME ASAP
        'major-version-in-path': false, // FIXME
        'operation-summary': false,  // Watcher almost don't have summaries. FIXME
      });

      config.shared.walker.no_empty_descriptions = false; // Watcher has lot of empty descriptions. This must be configured in such a tricky way,
      // because ibm linter does strange things
    }

    if(project == "watcher-old") {
      Object.assign(ruleset, {
        'array-responses': false,
        'inline-response-schema': false, // Only 2 clauses, FIXME ASAP
        'major-version-in-path': false, // FIXME
        'operation-summary': false,  // Watcher almost don't have summaries. FIXME
        'property-description': false,
        'parameter-description': false,
        'operation-description': false,
      });

      config.shared.walker.no_empty_descriptions = false; // Watcher has lot of empty descriptions. This must be configured in such a tricky way,
      // because ibm linter does strange things
    }

    if(project == "protocollum") {
      Object.assign(ruleset, {
        'inline-response-schema': false,
        'operation-summary': false,
        'operation-tags': false,
        'array-responses': false,
        'property-description': false,
        'parameter-description': false,
        'operation-description': false,
      });
      delete ruleset['jsonapi-error-response-schema'];
    }

    if(project == "iris-v2") {
      Object.assign(ruleset, {
        'array-responses': false, // FIXME
        'operation-summary': false,  // FIXME
        'inline-response-schema': false, // FIXME
        'major-version-in-path': false, // FIXME 
        'ibm-error-content-type-is-json': false, // FIXME
        'property-description': false, // FIXME
        'parameter-description': false, // FIXME
        'operation-description': false, // FIXME
      })
      delete ruleset['jsonapi-error-response-schema'];
      config.shared.walker.no_empty_descriptions = false; // FIXME
      config.shared.walker.incorrect_ref_pattern = false; // FIXME
    }

    if(project == "iris") {
      Object.assign(ruleset, {
        'property-description': false,
        'parameter-description': false,
        'operation-description': false,
        'ibm-error-content-type-is-json': false, // FIXME
        'operation-summary': false,  // FIXME
        'inline-response-schema': false, // FIXME
        'major-version-in-path': false, // FIXME
        'array-responses': false, // FIXME
      });
      delete ruleset['jsonapi-error-response-schema'];
      config.shared.walker.incorrect_ref_pattern = false; // FIXME
      config.shared.walker.no_empty_descriptions = false; // Old IRIS API is deprecated. Do not fix me.
    }

    if(project == "streaming") {
      Object.assign(ruleset, {
        'major-version-in-path': false, // WONTFIX
      });
    }

    if(project == "vision") {
      Object.assign(ruleset, {
        'array-of-arrays': false, // FIXME
        'property-format-naming': propertyFormatNaming,
        'oas3-unused-component': false
      })
    }

    if(project == "cloud") {
      config.shared.walker.duplicate_sibling_description = false;  // need off for use $ref and description same level
    }

    if(project == "bss-auth" || project == "billing-client" || project == "billing" || project == "talks") {
      Object.assign(ruleset, {
        'property-description': false, // FIXME
        'parameter-description': false, // FIXME
        'operation-description': false, // FIXME
      });
    }

    if(project == "license-bk") {
      Object.assign(ruleset, {
        'array-responses': false, // v1 compatibility
        'major-version-in-path': false, // need cover both v1 and v2 APIs
      })
      delete ruleset['jsonapi-error-response-schema']; // v1 compatibility
    }

    return {
      extends: ibmCloudValidationRules,
      rules: ruleset
    }
  }
};
