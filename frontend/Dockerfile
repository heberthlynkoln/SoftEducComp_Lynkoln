# Imagem base: servidor web Nginx em versão enxuta
FROM nginx:1.27-alpine

# Configuração do Nginx (serve o site e encaminha /api/ ao backend)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Página do frontend
COPY index.html /usr/share/nginx/html/index.html

EXPOSE 80
