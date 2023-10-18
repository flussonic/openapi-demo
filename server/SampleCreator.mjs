import JsonPointer from 'json-pointer';
import OpenAPISampler from "openapi-sampler";
import {isObject, isArray, isUndefined} from './utils/is.mjs';

/**
 * Создание мок данных на основе схемы
 */
export class SampleCreator {
    fullApiSchema;
    // схема элемента, все реф ссылки заменены данными
    _elementSchema;
    // все ключи всех examples
    exampleKeys = [];
    defaultKeyName = 'default';

    set elementSchema(nextElementSchema) {
        this._elementSchema = nextElementSchema;
    }
    get elementSchema() {
        return structuredClone(this._elementSchema);
    }

    constructor(elementSchema, fullApiSchema, schemaName) {
        this.scope = schemaName;
        this.fullApiSchema = fullApiSchema;
        this.elementSchema = this.resolveRefsRecursive(elementSchema);
    }

    /**
     * Заменяет все рефы данными
     * @param {object} schema - часть схемы
     */
    resolveRefsRecursive(schema) {
        if (Array.isArray(schema)) {
            return schema.map(schemaItem => {
                return this.resolveRefsRecursive(schemaItem);
            })
        }
        if (isObject(schema)) {
            if (schema.$ref) {
                return this.resolveRefsRecursive(JsonPointer.get(this.fullApiSchema, schema.$ref.substring(1)));
            }
            if ((schema.examples || schema.example) && schema.default) {
                delete schema.default;
            }
            // запоминаем ключи examples
            if (isObject(schema.examples)) {
                // прежде всего удалим примеры с чужими scope (см. также lib/api.mjs)
                for (let example in schema.examples) {
                    if(schema.examples[example]['x-scope'] && !schema.examples[example]['x-scope'].includes(this.scope)) {
                        delete schema.examples[example];
                    }
                }
                // все ключи examples кроме дефолтного
                const currentExamplesKeys = Object.keys(schema.examples).filter(keyName => keyName !== this.defaultKeyName);
                this.exampleKeys = Array.from(new Set([...this.exampleKeys, ...currentExamplesKeys]));
            }
            return Object.entries(schema).reduce((accumulator, [schemaItemName, schemaItemValue]) => {
                accumulator[schemaItemName] = this.resolveRefsRecursive(schemaItemValue);
                return accumulator;
            }, {});
        }
        return schema;
    }

    /**
     * Заполняет поле example из examples для openapi-sampler
     * Используются по очереди ключи из this.exampleKeys.
     *
     * Например:
     * {
     *      id: {
     *          examples: {default: {value: '61fa2d68'}, one: {value: '75e4'}}
     *      },
     *      opened_at: {
     *          examples: {one: {value: 555}, default: {value: 444}}
     *      },
     *  }
     * ==========>
     * c ключем `default`
     * {
     *     id: {
     *         example: '61fa2d68'
     *     },
     *     opened_at: {
     *         example: 444
     *     }
     * }
     *
     * @param {object} schema
     * @param {string} examplesKey - ключ examples
     * @param {number} index - определят какой элемент из oneof будет использован
     */
    replaceExamplesRecursive(schema, examplesKey, index) {
        if (Array.isArray(schema)) {
            return schema.map(schemaItem => {
                return this.replaceExamplesRecursive(schemaItem, examplesKey, index);
            })
        }
        if (isObject(schema)) {
            if (schema.oneOf && isArray(schema.oneOf) && schema.oneOf.length > 1) {
                const oneOfKey = index % schema.oneOf.length;
                const {oneOf, ...nextSchema} = {...schema, ...schema.oneOf[oneOfKey]};
                return this.replaceExamplesRecursive(
                    nextSchema, examplesKey, index
                );
            }
            // examples в схеме может быть только объектом
            if (schema.examples) {
                const nextExample = schema.examples[examplesKey]?.value;
                if (!isUndefined(nextExample)) {
                    schema.example = nextExample;
                }
            }
            return Object.entries(schema).reduce((accumulator, [schemaItemName, schemaItemValue]) => {
                accumulator[schemaItemName] = this.replaceExamplesRecursive(schemaItemValue, examplesKey, index);
                return accumulator;
            }, {});
        }
        return schema;
    }

    /**
     * Создает мок данные элемента на основе examples схемы элемента.
     *
     * @param {number} index - порядковый номер элемента нужен для получения
     * нужного ключа examples.
     */
    create(index) {
        const exampleKey = this.exampleKeys[index];
        const sampleWithExamples = this.replaceExamplesRecursive(
            this.elementSchema, exampleKey ?? this.defaultKeyName, index
        );
        return OpenAPISampler.sample(sampleWithExamples, {quiet: true}, this.fullApiSchema);
    }
}
