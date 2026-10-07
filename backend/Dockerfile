# Imagem base: Python 3.12 em versão enxuta
FROM python:3.12-slim

# Pasta de trabalho dentro do contêiner
WORKDIR /app

# Copiar primeiro só as dependências permite ao Docker reaproveitar
# o cache quando apenas o código muda
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar o código da aplicação
COPY . .

# Porta em que a API escuta dentro do contêiner
EXPOSE 8000

# Comando executado quando o contêiner inicia
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
