#!/usr/bin/env bash
cp index.html electron-index.html
sed -i -e "s/href=\"\/\"/href=\".\/\"/g" electron-index.html
rm electron-index.html-e

openssl dgst -sha256 *index.html
