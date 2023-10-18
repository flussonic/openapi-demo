PROJECT_ROOT=$(shell dirname $(realpath $(lastword $(MAKEFILE_LIST))))
FLUSSONIC_VERSION?=$(shell git log --pretty='format:%H' $(PROJECT_ROOT)/openapi/flussonic|head -1 |xargs git describe | sed 's/^v//'| awk -F '-g' '{print $$1}')
WATCHER_VERSION?=$(shell git log --pretty='format:%H' $(PROJECT_ROOT)/openapi/watcher|head -1 |xargs git describe | sed 's/^v//'| awk -F '-g' '{print $$1}')
SIGUR_VERSION?=$(shell git log --pretty='format:%H' $(PROJECT_ROOT)/openapi/sigur|head -1 |xargs git describe | sed 's/^v//'| awk -F '-g' '{print $$1}')
VISION_VERSION?=$(shell git log --pretty='format:%H' $(PROJECT_ROOT)/openapi/vision|head -1 |xargs git describe | sed 's/^v//'| awk -F '-g' '{print $$1}')

.PHONY: deploy

ifeq (,$(BRANCH))
  ifeq (,$(CI_COMMIT_REF_SLUG))
    BRANCH = $(shell git rev-parse --abbrev-ref HEAD| sed 's/\//-/')
  else
    BRANCH = $(CI_COMMIT_REF_SLUG)
  endif
endif

SCHEMAS_IMAGE ?= flussonic/schemas/schemas:${BRANCH}

build:
	@echo CI_REGISTRY=$(CI_REGISTRY)
	@echo CI_COMMIT_REF_SLUG=${CI_COMMIT_REF_SLUG}
	@echo BRANCH=${BRANCH}
	@echo SCHEMAS_IMAGE=${SCHEMAS_IMAGE}

	docker build \
	--build-arg FLUSSONIC_VERSION=${FLUSSONIC_VERSION} \
	--build-arg WATCHER2_VERSION=${WATCHER2_VERSION} \
	--build-arg IRIS_VERSION=${IRIS_VERSION} \
	--build-arg REDOC_REPO_TOKEN=${REDOC_REPO_TOKEN} \
	 -t ${SCHEMAS_IMAGE} .

extract:
	CONTAINER=$$(docker create ${SCHEMAS_IMAGE}); \
	docker cp $${CONTAINER}:/schemas/html html/ ;\
	docker rm -f $${CONTAINER}

test-mock-server:
	docker run --rm ${SCHEMAS_IMAGE} ./server.mjs test

jest:
	docker run --rm ${SCHEMAS_IMAGE} /bin/bash -c "yarn jest"

flussonic:
	FLUSSONIC_VERSION=${FLUSSONIC_VERSION} ./linter.mjs openapi/flussonic/flussonic.yml
	./node_modules/.bin/redoc-cli build html/private/flussonic.json && mv redoc-static.html html/private/flussonic.html
	./node_modules/.bin/redoc-cli build html/flussonic-public.json && mv redoc-static.html html/flussonic-public.html

chassis:
	FLUSSONIC_VERSION=${FLUSSONIC_VERSION} ./linter.mjs openapi/flussonic/chassis.yml
	./node_modules/.bin/redoc-cli build html/private/chassis.json && mv redoc-static.html html/private/chassis.html

cloud:
	FLUSSONIC_VERSION=${FLUSSONIC_VERSION} ./linter.mjs openapi/flussonic/cloud.yml
	./node_modules/.bin/redoc-cli build html/private/cloud.json && mv redoc-static.html html/private/cloud.html
	./node_modules/.bin/redoc-cli build html/cloud-public.json && mv redoc-static.html html/cloud.html

cloud-internal:
	FLUSSONIC_VERSION=${FLUSSONIC_VERSION} ./linter.mjs openapi/flussonic/cloud-internal.yml
	./node_modules/.bin/redoc-cli build html/private/cloud-internal.json && mv redoc-static.html html/private/cloud-internal.html

cloud-auth:
	FLUSSONIC_VERSION=${FLUSSONIC_VERSION} ./linter.mjs openapi/flussonic/cloud-auth-backend.yml
	./node_modules/.bin/redoc-cli build html/cloud-auth-backend-public.json && mv redoc-static.html html/cloud-auth-backend.html

central:
	FLUSSONIC_VERSION=${FLUSSONIC_VERSION} ./linter.mjs openapi/flussonic/central.yml
	./node_modules/.bin/redoc-cli build html/private/central.json && mv redoc-static.html html/private/central.html
	./node_modules/.bin/redoc-cli build html/central-public.json && mv redoc-static.html html/central-public.html

auth:
	FLUSSONIC_VERSION=${FLUSSONIC_VERSION} ./linter.mjs openapi/flussonic/auth-backend.yml
	./node_modules/.bin/redoc-cli build html/auth-backend-public.json && mv redoc-static.html html/auth-backend.html

config-external:
	FLUSSONIC_VERSION=${FLUSSONIC_VERSION} ./linter.mjs openapi/flussonic/config-external.yml
	./node_modules/.bin/redoc-cli build html/config-external-public.json && mv redoc-static.html html/config-external.html

streaming:
	FLUSSONIC_VERSION=${FLUSSONIC_VERSION} ./linter.mjs openapi/flussonic/streaming.yml
	./node_modules/.bin/redoc-cli build html/private/streaming.json && mv redoc-static.html html/private/streaming.html
	./node_modules/.bin/redoc-cli build html/streaming-public.json && mv redoc-static.html html/streaming-public.html

watcher:
	WATCHER_VERSION=${WATCHER_VERSION} ./linter.mjs openapi/watcher/watcher.yml
	./node_modules/.bin/redoc-cli build html/private/watcher.json && mv redoc-static.html html/private/watcher.html

watcher-client:
	FLUSSONIC_VERSION=${FLUSSONIC_VERSION} ./linter.mjs openapi/watcher/client.yml
	./node_modules/.bin/redoc-cli build html/private/watcher-client.json && mv redoc-static.html html/private/watcher-client.html
	./node_modules/.bin/redoc-cli build html/watcher-client-public.json && mv redoc-static.html html/watcher-client-public.html

watcher-core:
	FLUSSONIC_VERSION=${FLUSSONIC_VERSION} ./linter.mjs watcher-core
	./node_modules/.bin/redoc-cli build html/watcher-core.json && mv redoc-static.html html/watcher-core.html

sigur:
	SIGUR_VERSION=${SIGUR_VERSION} ./linter.mjs openapi/sigur/sigur.yml
	./node_modules/.bin/redoc-cli build html/private/sigur.json && mv redoc-static.html html/sigur.html

vision: vision-inference vision-identification vision-config-external
vision-inference:
	VISION_VERSION=${VISION_VERSION} ./linter.mjs openapi/vision/vision.yml
	./node_modules/.bin/redoc-cli build html/private/vision.json && mv redoc-static.html html/private/vision.html

vision-identification:
	VISION_VERSION=${VISION_VERSION} ./linter.mjs openapi/vision/identification.yml
	./node_modules/.bin/redoc-cli build html/private/vision-identification.json && mv redoc-static.html html/private/vision-identification.html

vision-config-external:
	VISION_VERSION=${VISION_VERSION} ./linter.mjs openapi/vision/vision-config-external.yml
	./node_modules/.bin/redoc-cli build html/vision-config-external-public.json && mv redoc-static.html html/vision-config-external-public.html

client-area:
	./linter.mjs openapi/client-area/client-area.yml
	./node_modules/.bin/redoc-cli build html/private/client-area.json && mv redoc-static.html html/private/client-area.html

doc: \
	flussonic \
	chassis \
	auth \
	config-external \
	watcher \
	watcher-client \
	watcher-core \
	streaming \
	vision \
	central \
	sigur \
	client-area
