#!/usr/bin/env bash


set -eux pipefail

yarn spec

sleep 2.25

yarn test

sleep 2.25

rm -rf ./dist/
yarn build

NODE_ENV=production node ./post-build.js

cp ./package.build.json ./dist/package.json
