import { SampleCreator } from "./SampleCreator.mjs";
import {deepPatch} from "./utils/deepPatch.mjs";

export class MockDb {
  data = {};
  sessionData = {};
  api;
  defaultCollectionCount = 5;
  /**
   * количество элементов для отдельных коллекций
   * @type {{ {string}: number }}
   */
  collectionCount = {}

  // callbacks
  onBeforeCreateCollectionItem = (collection_name, object, i) => object
  onCollectionSeed (collection_name) {}
  onCollectionItemSave (collection_name, body) {}

  /**
   * @param {Object} api - full api schema
   */
  constructor (api) {
    this.api = api;
  }

  /**
   * @param schema
   * @return {string|undefined}
   */
  find_primary_key(schema) {
    if(schema['$ref']) {
      const typename = schema['$ref'].replace("#/components/schemas/","");
      const type = this.api.components.schemas[typename];
      return this.find_primary_key(type)
    }
    if(schema.allOf) {
      for(let i = 0; i < schema.allOf.length; i++) {
        const pk = this.find_primary_key(schema.allOf[i]);
        if(pk) return pk;
      }
    }
    if(schema.type === "object" && schema.properties) {
      for(let k in schema.properties) {
        if(schema.properties[k]['x-primary-key'])
          return k;
      }
      if (schema.properties['id']) {
        return 'id';
      }
    }
    return undefined;
  }

  /**
   * Заполнение базы на основе схемы
   * @param {string} collection_name
   * @param {object} schema
   * @see https://github.com/Redocly/openapi-sampler#example
   */
  db_seed(collection_name, schema, schemaName=null) {
    if(!schema) {
      console.log(`ERROR: schema is null for '${collection_name}'`);
      return;
    }
    if(this.data[collection_name])
      return;
    this.data[collection_name] = {data: []};
    // нужно вычислить primary key
    const primary_key = this.find_primary_key(schema);
    this.data[collection_name].primary_key = primary_key;

    const count = this.collectionCount[collection_name] || this.defaultCollectionCount;
    const sampleCreator = new SampleCreator(schema, this.api, schemaName);

    for(let i = 0; i < count; i++) {
      let object = sampleCreator.create(i);

      this.onBeforeCreateCollectionItem(collection_name, object, i);

      if(primary_key) {
        let initial_pk = object[primary_key];
        for(let j = 0; j < this.data[collection_name].data.length; j++) {
          if(this.data[collection_name].data.find((e) => e[primary_key] == initial_pk)) {
            object[primary_key] = initial_pk + (j + 1);
          }
        }
      }
      this.data[collection_name].data.push(object)
    }
    this.onCollectionSeed(collection_name);
  }

  /**
   * Возвращает данные для сессии
   * @param {string} session_id
   */
  db_ensure_session(session_id) {
    if(!this.sessionData)
      this.sessionData = {};
    if(!this.sessionData[session_id]) {
      let old_sessions = Object.keys(this.sessionData).sort();
      if(old_sessions.length > 1000) {
        old_sessions.splice(0,100).forEach((s) => {
          delete this.sessionData[s];
        });
      }
      this.sessionData[session_id] = JSON.parse(JSON.stringify(this.data));
      console.log(`allocate new session ${session_id}`)
    }
    return this.sessionData[session_id];
  }

  /**
   * Поиск индекса элемента по параметрам
   * @param session_id
   * @param collection_name
   * @param params
   * @return {number|undefined}
   */
  db_lookup(session_id, collection_name, params) {
    if(!this.data || !this.data[collection_name])
      return -1;

    let collection = this.db_collection(session_id, collection_name);

    return collection.findIndex((e) => {
      for(let k in params) {
        if(params[k] != e[k]) return false;
      }
      return true;
    })
  }

  /**
   * Получение элемента коллекции по индексу
   * @param session_id
   * @param collection_name
   * @param index
   */
  db_read(session_id, collection_name, index) {
    let collection = this.db_collection(session_id, collection_name);
    return collection[index];
  }

  /**
   * Получение всей коллекции
   * @param session_id
   * @param collection_name
   * @return {object}
   */
  db_collection(session_id, collection_name) {
    let collection = this.sessionData[session_id] ?
      this.sessionData[session_id][collection_name].data :
      this.data[collection_name].data;
    return collection;
  }

  /**
   * Добавление в коллекцию
   * @param {string|undefined} session_id
   * @param {string} collection_name
   * @param {object} body
   * @return {boolean}
   */
  db_push(session_id, collection_name, body) {
    let session = this.db_ensure_session(session_id);
    session[collection_name].data.push(body);
  }

  /**
   * Замена элемента
   * @param {string|undefined} session_id
   * @param {string} collection_name
   * @param {number} index
   * @param {object} modified
   */
  db_replace(session_id, collection_name, index, modified) {
    let session = this.db_ensure_session(session_id);
    session[collection_name].data[index] = modified;
  }

  /**
   * Получение элемента коллекции по параметрам
   * @param {string|undefined} session_id
   * @param {string} collection_name
   * @param {object} params
   * @return {undefined|*}
   */
  db_get(session_id, collection_name, params) {
    let index = this.db_lookup(session_id, collection_name, params);
    if(index === -1)
      return undefined;
    return this.db_read(session_id, collection_name, index)
  }

  /**
   * Удаление элемента
   * @param {string|undefined} session_id
   * @param {string} collection_name
   * @param {object} params
   * @return {boolean}
   */
  db_delete(session_id, collection_name, params) {
    let index = this.db_lookup(session_id, collection_name, params);
    if(index === -1)
      return false;
    let session = this.db_ensure_session(session_id);
    session[collection_name].data.splice(index,1);
    return true;
  }

  /**
   * Обновление или добавление элемента
   * @param {string|undefined} session_id
   * @param {string} collection_name
   * @param {object} params
   * @param body
   * @return {any}
   */
  db_save({
    session_id,
    collection_name,
    params,
    body,
    schema,
  }) {
    let index = this.db_lookup(session_id, collection_name, params);

    if(index == -1) {
      let pk = this.data[collection_name].primary_key;
      if(params[pk]) {
        body[pk] = params[pk];
        this.db_push(session_id, collection_name, body);
        return body;
      }
    } else {
      let original = this.db_read(session_id, collection_name, index);
      let modified = deepPatch(original, body);
      this.db_replace(session_id, collection_name, index, modified);
      return modified;
    }
  }
}
