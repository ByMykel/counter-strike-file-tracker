#!/bin/bash

git add .

changed_files=$(git status --porcelain | awk '{print $2}')

git diff --quiet && git diff --staged --quiet || git commit -m "[bot] Update | $(echo "$changed_files" | wc -l) files"
git push origin main