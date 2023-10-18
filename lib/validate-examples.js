/**
 * @typedef {Object} SchemaPart
 * @property {'string'|'number'|'integer'|'boolean'|'array'|'object'} type
 * @property {?Object} examples
 * @property {?any} example
 * @property {?boolean} nullable
 * @property {?SchemaPart[]} allOf
 * @property {?SchemaPart[]} anyOf
 * @property {?SchemaPart[]} oneOf
 * @property {?SchemaPart} items
 * @property {?string[]} enum
 * @property {?Object.<string, SchemaPart>} properties
 * @property {?string[]} required
 * @property {?string} const
 */


const isArray = val => Array.isArray(val);
const isObject = val => typeof val === 'object' && !isArray(val) && val !== null;
const isUndefined = val => typeof val === 'undefined';
const isDefined = val => !isUndefined(val);
const isNull = val => val === null;
const isNil = val => isUndefined(val) || isNull(val);

const getJsType = (val) => {
    if (typeof val === 'object') {
        if (Array.isArray(val)) {
            return 'array';
        } else if (val === null) {
            return 'null';
        }
        return 'object';
    } else {
        return typeof val;
    }
}

/**
 * Валидация одиночного example
 * - проверяет тип данных
 * - проверяет, чтобы example содержал required поля
 * @param {SchemaPart} schemaPart
 * @param example
 * @return {boolean}
 */
const validateExampleRecursive = (schemaPart, example) => {
    // nullable
    if (isNil(example) && schemaPart.nullable) {
        return true;
    }

    // allOf
    if (schemaPart.allOf && isArray(schemaPart.allOf)) {
        return schemaPart.allOf.every(schemaPartItem => validateExampleRecursive(schemaPartItem, example));
    }

    // anyOf
    if (schemaPart.anyOf && isArray(schemaPart.anyOf)) {
        return schemaPart.anyOf.some(schemaPartItem => validateExampleRecursive(schemaPartItem, example));
    }

    // oneOf
    if (schemaPart.oneOf && isArray(schemaPart.oneOf)) {
        const isOneOfAsEnum = schemaPart.oneOf.find((oneOfValue) => !!oneOfValue.const);
        if (isOneOfAsEnum) {
            return schemaPart.oneOf.find((oneOfValue) => oneOfValue.const === example);
        } else {
            return schemaPart.oneOf.some(schemaPartItem => validateExampleRecursive(schemaPartItem, example));
        }
    }

    // enum as string[]
    if (schemaPart.enum) {
        return schemaPart.enum.includes(example);
    }

    const exampleType = getJsType(example);

    switch (schemaPart.type) {
        case 'object':
            if (exampleType !== 'object') {
                return false;
            }
            // если нет "properties", возможны любые объекты
            if (!schemaPart.properties) {
                return true;
            }
            // все поля из "required" должны быть в example
            const isRequiredPropsExists = !schemaPart.required ||
                schemaPart.required.every(requiredPropertyName =>
                    Object.keys(example).includes(requiredPropertyName)
                );
            // проверяем каждое свойство из example
            const isExamplePropsValid = Object.keys(example).every((examplePropName) => {
                    // допускаем, что схемы этого свойства может не быть,
                    // потому что это может быть только часть схемы из allOf
                    if (!schemaPart.properties[examplePropName]) return true;
                    return validateExampleRecursive(schemaPart.properties[examplePropName], example[examplePropName]);
                }
            );
            return isRequiredPropsExists && isExamplePropsValid;
        case 'array':
            if (exampleType !== 'array') {
                return false;
            }
            // "items" должны быть у всех array
            if (!schemaPart.items) {
                console.log(`has no items`);
                return true;
            }
            // проверяем каждый элемент массива example
            return example.every(exampleItem => {
                return validateExampleRecursive(schemaPart.items, exampleItem);
            });
        case 'integer':
        case 'number':
            return exampleType === 'number';
        default:
            return schemaPart.type === exampleType;
    }
}

/**
 * валидация examples в виде объекта
 * e.g. examples: { default: { value: 'anyValue' } }
 * @param {SchemaPart} schemaPart
 * @return {boolean}
 */
const validateExamples = (schemaPart) => {
    if (!schemaPart.examples) return true;
    if (!isObject(schemaPart)) return false;

    const someInvalid = Object.values(schemaPart.examples).some(exampleItem =>
        (typeof exampleItem.value === 'undefined' || !validateExampleRecursive(schemaPart, exampleItem.value)
    ));
    return !someInvalid;
}

/**
 * @param {string[]} path
 * @param {SchemaPart|SchemaPart[]} schemaPart
 * @return {string[]} - errors
 */
const findExamplesRecursive = (path, schemaPart) => {
    let errors = [];
    if (isArray(schemaPart)) {
        schemaPart.forEach((schemaItem, key) => {
            errors = errors.concat(findExamplesRecursive([...path, key], schemaItem));
        });
    } else if (isObject(schemaPart)){
        if (isDefined(schemaPart.example) && !validateExampleRecursive(schemaPart, schemaPart.example)) {
            errors.push({ path, message: ` invalid example "${schemaPart.example}"`});
        }
        if (isDefined(schemaPart.examples) && !validateExamples(schemaPart)) {
            errors.push({ path, message: ' invalid examples'});
        }
        Object.entries(schemaPart).forEach(([key, schemaItem]) => {
            errors = errors.concat(findExamplesRecursive([...path, key], schemaItem));
        });
    }
    return errors;
}
const validate = (schema, _opts, _arg) => {
    const initialPath = _arg.path;

    return findExamplesRecursive(initialPath, schema);
}

module.exports = {
    description: 'examples should be valid',
    message: '{{error}}',
    given: '$.components.schemas',
    severity: 'warn',
    resolved: true,
    then: {
        function: validate
    }
}