#!/bin/bash

set -euxo pipefail

SQLITE3_VERSION="3.46.0"
PYSQLITE3_VERSION="0.5.3"

# Fetch the source code for the latest release of Sqlite.
if [[ ! -d "sqlite" ]]; then
  wget https://www.sqlite.org/2024/sqlite-amalgamation-3460000.zip -O sqlite.zip
  unzip sqlite.zip
  mv sqlite-amalgamation-3460000 sqlite
  cd sqlite/
  cd ../
  rm sqlite.zip
fi

# Grab the pysqlite3 source code.
if [[ ! -d "./pysqlite3" ]]; then
  git clone https://github.com/coleifer/pysqlite3.git
fi

cd pysqlite3/
git checkout ${PYSQLITE3_VERSION}

# Copy the sqlite3 source amalgamation into the pysqlite3 directory so we can
# create a self-contained extension module.
cp "../sqlite/sqlite3.c" ./
cp "../sqlite/sqlite3.h" ./

# Create the wheel and put it in the /wheels dir.
sed -i "s|name='pysqlite3-binary'|name=PACKAGE_NAME|g" setup.py
python3 setup.py build_static
pip3 wheel . -w /wheels
