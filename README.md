# Кодогенерация

Важное правило использования этого репозитория в том, чтобы кодогенерировать ту часть,
которая будет генерировать ответы и запросы на основании схемы.


Схемы становятся довольно сложными и поэтому требуется использовать JS апи, которое предоставляет этот
репозиторий.

Пример из флюссоника contrib/devel/openapi.mjs:


```
import {
  load_api,
} from '../../../schemas/lib/api.mjs';

let schema_path = '../schemas/openapi/flussonic/flussonic.yml';

load_api(schema_path, "flussonic").then(function(api) {
  let playback_path = path.dirname(schema_path) + "/playback.yml";
  load_api(playback_path, "flussonic").then(function(playback_api) {
    draw(api, playback_api);
  })
}).catch(function(err) {
  console.log(err);
});

```

Т.е. пользуемся функцией `load_api`, которая вернет распарсенный результат.




# Edit rules

## Operation


```
method:
  operationId: target_action  (i.e.  streams_list)
  summary: short description in left column
  description: Long extended description for documenting everything here
  parameters:
  - name: parameter_name
    description: ...
    ...
```


