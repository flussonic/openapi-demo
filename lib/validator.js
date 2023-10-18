const chalk = require('chalk');

const buildSwaggerObject = require('ibm-openapi-validator/src/cli-validator/utils/build-swagger-object');
const config = require('ibm-openapi-validator/src/cli-validator/utils/process-configuration');
const {
  formatResultsAsObject
} = require('ibm-openapi-validator/src/cli-validator/utils/json-results');
const spectralValidator = require('ibm-openapi-validator/src/spectral/spectral-validator');
const validator = require('ibm-openapi-validator/src/cli-validator/utils/validator');
const path = require('path');
const fs = require('fs');
const { Spectral } = require('@stoplight/spectral-core');
const { rules } = require('../ruleset.js');
const { type } = require('os');

module.exports = async function(
  input,
  opts
) {
  // process the config file for the validations &
  // create an instance of spectral & load the spectral ruleset, either a user's
  // or the default ruleset
  let configObject;
  let spectralResults;

  try {
    const defaultMode = false;
    const configFileOverride = null;
    configObject = await config.get(defaultMode, chalk, configFileOverride);
  } catch (err) {
    return Promise.reject(err);
  }

  const swagger = await buildSwaggerObject(input);

  // This file was an almost copy of ibm-openapi-validator/index.js, but here it is different
  try {
    const spectral = new Spectral();
    let ruleset = rules(opts.project, configObject);
    spectral.setRuleset(ruleset);
    spectralResults = await spectral.run(input);
  } catch (err) {
    return Promise.reject(err);
  }
  const results = validator(swagger, configObject, spectralResults);

  // return a json object containing the errors/warnings
  const validationResult = formatResultsAsObject(results);
  if(validationResult.warnings) {
    validationResult.warnings = validationResult.warnings.filter((w) => {
      // Этот костыль добавлен по той причине, что единственное место, где ссылаются на mpegts_lang_track
      // это x-key-type, который нужен флюссонику для парсинга конфига, а утилиты openapi не
      // умеют ходить по этому полю для построения зависимостей
      if(w.path[w.path.length-1] == 'mpegts_lang_track' && w.rule == 'oas3-unused-component') {
        return false;
      }
      return true;
    });
  }
  return validationResult;
};
