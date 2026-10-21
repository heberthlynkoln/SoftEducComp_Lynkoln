# Imagem base: servidor web Nginx em versão enxuta
FROM nginx:1.27-alpine

# Configuração do Nginx (serve o site e encaminha /api/ ao backend)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Arquivos do frontend (os testes em tests/ não vão para a imagem)
COPY index.html styles.css exemplos.js api.js app.js /usr/share/nginx/html/

EXPOSE 80
