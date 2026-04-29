-- Migration 001: schemas e extensões base.
-- Habilita extensões necessárias para o restante do schema. Idempotente.

-- pg_net: chamadas HTTP a partir do Postgres (pg_cron → edge functions).
CREATE EXTENSION IF NOT EXISTS pg_net;

-- pg_cron: agendador nativo (cria caixa diário, notificações, backup semanal).
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- http: utilitário extra (consultas pontuais a APIs externas).
CREATE EXTENSION IF NOT EXISTS http;

-- pgjwt: JWT helpers (usado em testes e validações).
CREATE EXTENSION IF NOT EXISTS pgjwt;

-- Schema 'app' para utilitários administrativos. Não usado pelo cliente.
CREATE SCHEMA IF NOT EXISTS app;

-- Timezone canônica do projeto. Todas as datas/horas operam em America/Sao_Paulo
-- na lógica de negócio (calendário comercial, fechamento de mês, cron jobs).
ALTER DATABASE postgres SET timezone TO 'America/Sao_Paulo';
