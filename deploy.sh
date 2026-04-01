#!/bin/bash

echo "--- 1. Ziehe neuesten Code (falls Git genutzt wird) ---"
# git pull

echo "--- 2. Baue Frontend neu ---"
cd frontend
npm install
npm run build
cd ..

echo "--- 3. Starte Docker-Flotte neu (mit neuem Build) ---"
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

echo "--- 4. Räume alte Docker-Leichen auf ---"
docker image prune -f

echo "--- FERTIG! System ist live. ---"