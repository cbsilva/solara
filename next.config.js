/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // O Next 16 injeta um bloco de instrucoes pra agentes de IA em CLAUDE.md a
  // cada `next dev`. Este projeto ja mantem CLAUDE.md com as regras da casa
  // (ver arquivo), entao desativamos a injecao automatica.
  agentRules: false,
}

module.exports = nextConfig
