# Wir nutzen ein schlankes Debian-basiertes Node-Image
FROM node:20-slim

# Installieren der System-Abhängigkeiten für Puppeteer / Chromium
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    chromium \
    fonts-liberation \
    libnss3 \
    libxss1 \
    libasound2 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Umgebungsvariablen für Puppeteer (verhindert den eigenen Download und nutzt den installierten Browser)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Arbeitsverzeichnis im Container festlegen
WORKDIR /app

# Package-Dateien kopieren
COPY package*.json ./

# Abhängigkeiten installieren (für Dev nutzen wir npm install)
RUN npm install

# Den restlichen Backend-Code in den Container kopieren
COPY . .

# Port für die API freigeben
EXPOSE 5000

# Standard-Startbefehl (Startet die Haupt-API)
# Für die Worker überschreiben wir diesen Befehl später in der docker-compose.yml!
CMD ["npm", "start"]