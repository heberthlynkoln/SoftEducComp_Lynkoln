// Sobe o backend REAL (uvicorn) para os testes de integração e o derruba no final.
// Se Python/uvicorn não estiverem disponíveis, os testes de integração são ignorados (com aviso).
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'backend');

function portaLivre() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
    srv.on('error', reject);
  });
}

async function aguardar(url, ms) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    try { const r = await fetch(url); if (r.ok) return true; } catch (e) { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

export default async function setup() {
  process.env.BACKEND_URL = '';
  const porta = await portaLivre();
  const python = process.env.PYTHON || 'python3';
  const proc = spawn(python, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(porta)],
    { cwd: backend, stdio: 'ignore' });
  let falhou = false;
  proc.on('error', () => { falhou = true; });
  const url = `http://127.0.0.1:${porta}`;
  const ok = !falhou && await aguardar(`${url}/api/health`, 15000);
  if (ok) process.env.BACKEND_URL = url;
  else console.warn('\n[integração] Não foi possível iniciar o backend (Python + `pip install -r backend/requirements.txt`); testes de integração serão ignorados.\n');
  return () => { proc.kill(); };
}
