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

---

-- Tabela: extratos_importados
CREATE TABLE extratos_importados (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_arquivo TEXT NOT NULL,
  importado_em TIMESTAMPTZ DEFAULT now(),
  importado_por UUID REFERENCES auth.users(id),
  total_linhas INT,
  total_creditos DECIMAL(15,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_extratos_importado_por ON extratos_importados(importado_por);

---

-- Tabela: lancamentos
CREATE TABLE lancamentos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  extrato_id UUID NOT NULL REFERENCES extratos_importados(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  descricao TEXT,
  valor DECIMAL(15,2) NOT NULL,
  tipo TEXT NOT NULL,
  cod_titulo_casado TEXT,
  situacao TEXT NOT NULL DEFAULT 'divergente',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_lancamentos_extrato_id ON lancamentos(extrato_id);
CREATE INDEX idx_lancamentos_data ON lancamentos(data);
CREATE INDEX idx_lancamentos_situacao ON lancamentos(situacao);

---

-- Tabela: divergencias
CREATE TABLE divergencias (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  extrato_id UUID NOT NULL REFERENCES extratos_importados(id) ON DELETE CASCADE,
  tipo_inicial TEXT,
  lancamento_id UUID REFERENCES lancamentos(id),
  cod_titulo TEXT,
  valor_lancamento DECIMAL(15,2),
  valor_titulo DECIMAL(15,2),
  status TEXT NOT NULL DEFAULT 'nova',
  hipotese JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_divergencias_extrato_id ON divergencias(extrato_id);
CREATE INDEX idx_divergencias_status ON divergencias(status);
CREATE INDEX idx_divergencias_cod_titulo ON divergencias(cod_titulo);

-- Habilitar Realtime para Financeiro
ALTER PUBLICATION supabase_realtime ADD TABLE extratos_importados;
ALTER PUBLICATION supabase_realtime ADD TABLE lancamentos;
ALTER PUBLICATION supabase_realtime ADD TABLE divergencias;
