-- Tabela: execucoes_agentes
CREATE TABLE execucoes_agentes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  area TEXT NOT NULL,
  item_tipo TEXT NOT NULL,
  item_id TEXT NOT NULL,
  agente TEXT NOT NULL,
  chamado_por UUID,
  status TEXT NOT NULL DEFAULT 'rodando',
  entrada JSONB,
  saida JSONB,
  erro TEXT,
  tokens_entrada INT,
  tokens_saida INT,
  inicio TIMESTAMPTZ DEFAULT now(),
  fim TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performace
CREATE INDEX idx_execucoes_item_id ON execucoes_agentes(item_id);
CREATE INDEX idx_execucoes_area ON execucoes_agentes(area);
CREATE INDEX idx_execucoes_status ON execucoes_agentes(status);
CREATE INDEX idx_execucoes_chamado_por ON execucoes_agentes(chamado_por);

-- Habilitar Realtime (execute isto após criar a tabela)
ALTER PUBLICATION supabase_realtime ADD TABLE execucoes_agentes;

---

-- Tabela: aprovacoes
CREATE TABLE aprovacoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  area TEXT NOT NULL,
  item_tipo TEXT NOT NULL,
  item_id TEXT NOT NULL,
  titulo TEXT NOT NULL,
  proposta JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  decidido_por UUID REFERENCES auth.users(id),
  decidido_em TIMESTAMPTZ,
  observacao TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performace
CREATE INDEX idx_aprovacoes_status ON aprovacoes(status);
CREATE INDEX idx_aprovacoes_area ON aprovacoes(area);
CREATE INDEX idx_aprovacoes_item_id ON aprovacoes(item_id);

-- Habilitar Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE aprovacoes;
