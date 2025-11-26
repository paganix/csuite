#!/usr/bin/env bash

set -euo pipefail
clear

bold=$(tput bold)
reset=$(tput sgr0)
green=$(tput setaf 2)
red=$(tput setaf 1)
yellow=$(tput setaf 3)
blue=$(tput setaf 4)
gray=$(tput setaf 7)


log_section() {
  echo ""
  echo "${bold}${yellow}> $1${reset}"
}

log_success() {
  echo "${green}✓ $1${reset}"
}

log_error() {
  echo "${red}x $1${reset}"
}


build_c() {
  gcc -save-temps -Wall -Wextra -pedantic -o ./bin/out/test ./engine/test/test.c
}


if [[ ! -d "./bin/out" ]]; then
  echo "Output target directory does not exist, creating now..."
  mkdir -p ./bin/out
fi


log_section "C TESTS"

start_c=$(date +%s)

if build_c; then
  end_c=$(date +%s)
  c_time=$((end_c - start_c))

  log_success "C code compiled for tests in ${c_time}s"
  c_run_start=$(date +%s)

  if ./bin/out/test "$@"; then
    c_run_end=$(date +%s)
    c_run_time=$((c_run_end - c_run_start))

    log_success "C test code was successful executed, no errors found, in ${c_run_time}s"
  else
    log_error "C test executable was exited with non-ok status code"
    exit 1
  fi
else
  log_error "C test suit was failed"
  exit 1
fi


rm -rf ./bin/out/test
# rm -rf ./bin/out/test.ii
# rm -rf ./bin/out/test.o
# rm -rf ./bin/out/test.s


log_section "NODE.JS TESTS"
node_run_start=$(date +%s)
cd ./js-engine/

if yarn spec:inline && yarn test:inline; then
  node_run_end=$(date +%s)
  node_run_time=$((node_run_end - node_run_start))

  log_success "Node.JS test suit was successful executed, with no errors, in ${node_run_time}s"
else
  log_error "Node.JS test suit was failed"
  exit 1
fi
