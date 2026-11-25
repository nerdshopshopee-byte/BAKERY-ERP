# BAKERY ERP

**Sistema Integrado de Gestão de Padarias — Gestão 360°**

ERP completo para padarias: do pão saindo do forno ao fechamento do caixa, do PIX à folha de pagamento.

![Stack](https://img.shields.io/badge/Next.js_16-App_Router-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-strict-blue) ![Prisma](https://img.shields.io/badge/Prisma-SQLite-darkgreen) ![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-Tailwind_4-amber)

---

## Módulos

| Módulo | O que faz |
|--------|-----------|
| **Dashboard** | Faturamento hoje/semana/mês, lucro estimado, ticket médio, saldo de caixa, gráficos de 14 dias, vendas por categoria, top produtos, alertas de estoque e operação em tempo real |
| **PDV (Frente de Caixa)** | Catálogo com imagens, busca por nome/código de barras, produtos por peso (kg), carrinho, desconto, cliente, pagamento dividido em múltiplas formas, troco, comprovante e cancelamento com estorno |
| **Pedidos (KDS)** | Painel de produção em tempo real (polling 4s) com colunas Aguardando → Preparando → Pronto → Entregue, bipe sonoro para novos pedidos, destaque de pedidos atrasados e criação manual (WhatsApp/Encomenda/Delivery) |
| **Produção** | Receitas/fichas técnicas com custo por ingrediente, ordens de produção (planejada → andamento → concluída) com **baixa automática de insumos** proporcional ao lote e entrada de produto acabado |
| **Produtos** | Catálogo completo com categorias, margem calculada, preço/custo, código de barras, venda por peso e ativação/desativação |
| **Estoque** | Insumos com fornecedor, saldo vs. mínimo (barra de progresso com alertas), movimentações (entrada, saída, ajuste, perda, produção) e valor em estoque |
| **Compras** | Fornecedores, pedidos de compra por insumo, recebimento que **atualiza estoque + custo** e gera conta a pagar automaticamente |
| **Caixa** | Abertura/fechamento de sessão, sangria com validação de saldo, suprimento, movimentações em tempo real e conferência com diferença |
| **Financeiro** | Contas a pagar/receber com vencimentos, fluxo de caixa de 14 dias, DRE simplificada por categoria e lançamentos manuais |
| **Clientes** | Cadastro com fidelidade (pontos), saldo fiado integrado às vendas e aniversários |
| **Encomendas** | Bolos personalizados, festas e salgados com ficha de produção, sinal (40% sugerido), saldo a receber e fluxo Orçamento → Confirmada → Em produção → Pronta → Retirada |
| **Delivery** | Entregadores (veículo/ativação), taxas por região aplicadas automaticamente, controle de entregas (Pendente → Em rota → Entregue/Falhou) e KPIs do dia |
| **Qualidade e Desperdício** | Registro de perdas por produto/insumo com motivo (vencido, queimado, erro de produção, devolução), custo calculado no servidor, baixa de estoque com movimentação PERDA rastreável e KPIs de 30 dias |
| **Relatórios** | DRE gerencial (receita, CMV, lucro bruto/líquido, margem), vendas por categoria, top produtos, recebimentos por forma de pagamento, aderência de produção e desperdício por motivo — períodos de 7/30/90 dias |
| **Equipe** | Funcionários com cargos (7 perfis), salários, registro de ponto (entrada/saída) e permissões por perfil |
| **Mercado Pago** | Cobrança PIX (BR Code copia-e-cola), taxas/valor líquido, confirmação via webhook e conciliação — modo demonstração com o mesmo payload da API oficial |
| **Fiscal (Motor Fiscal)** | NFC-e modelo 65 e NF-e modelo 55 com chave de acesso de 44 dígitos (módulo 11), XML de autorização armazenado e consultável, DANFE 80mm/A4 na tela, autorização via provedor plugável, contingência off-line (tpEmis 9) com reenvio, cancelamento com justificativa, inutilização de faixa de numeração, tabelas tributárias versionadas com IBS/CBS (Reforma Tributária 2026) e trilha completa de eventos (emissão, autorização, rejeições, reenvios) |

## Autenticação e permissões (Fase 3)

Login individual por funcionário (e-mail + senha) com hash **Argon2id** (64 MiB), sessão única por usuário (cookie httpOnly com token opaco — o banco guarda apenas o SHA-256) e revogação imediata em bloqueios, resets e alterações de senha.

- **Catálogo centralizado de permissões** — 68 chaves estáveis (`sales.cancel`, `finance.payables.manage`, `inventory.costs`, `fiscal.emit`, `fiscal.config`...) em 13 módulos, fonte única usada pelo guard das APIs e pelo menu do frontend.
- **Dois níveis de acesso** — modelos de perfil reutilizáveis (Proprietário absoluto, Administrador, Gerente, Atendente, Padeiro, Estoquista, Financeiro, Entregador) + personalização individual por usuário (concessão extra, restrição que vence o perfil e **concessão temporária com validade**).
- **Segurança no backend, não no menu** — todos os ~50 endpoints exigem sessão e permissão específica (`guardApi`/`guardApiAny`); quem não tem `finance.view` não lê financeiro nem digitando a URL nem chamando a API. Custos de produtos são zerados na resposta para quem não tem `inventory.costs`. Negos são registrados na auditoria (`API_DENIED`).
- **Central de administração** (Configurações → Usuários e Permissões): usuários com busca/filtros/situação (Ativo/Inativo/Bloqueado), matriz granular com indicador parcial, marcar/desmarcar tudo por módulo, copiar permissões de outro usuário, aplicar permissões do perfil, redefinição de senha, encerramento de sessões; perfis editáveis com matriz própria; aba de auditoria (logins, falhas, alterações de permissão, bloqueios, negações de API).
- **Menu dinâmico** montado a partir das permissões efetivas, recarregadas ao focar a janela e a cada alteração administrativa; tela de acesso restrito sem vazamento de dados.
- **Multi-tenant (fundação)**: empresas + unidades autorizadas por usuário (`Company`, `Branch`, `UserMembership`, `UserBranchAccess`).

## Contas de demonstração

| E-mail | Senha | Perfil |
|--------|-------|--------|
| owner@bakeryerp.com.br | bakery2026 | Proprietário — acesso total |
| gerente@bakeryerp.com.br | padaria123 | Gerente — gestão operacional |
| joao@padaria.com.br | padaria123 | Atendente personalizado (extra `sales.revenue`, restrição `orders.create`, `sales.cancel` temporário) |
| padeiro@bakeryerp.com.br | padaria123 | Padeiro — produção |
| estoquista@bakeryerp.com.br | padaria123 | Estoquista — estoque e compras |
| financeiro@bakeryerp.com.br | padaria123 | Financeiro — financeiro e relatórios |
| entregador@bakeryerp.com.br | padaria123 | Entregador — delivery |
| bloqueado@bakeryerp.com.br | padaria123 | Bloqueado (teste de segurança) |

## Stack

- **Next.js 16 (App Router) + TypeScript** — ~60 route handlers de API protegidos por guard de permissões
- **Prisma + SQLite** — 45 modelos (vendas, pedidos, encomendas, delivery, produção, estoque, financeiro, pagamentos, auditoria, usuários/sessões/permissões/multi-tenant, motor fiscal)
- **Argon2id** (@noble/hashes) — hash de senhas com verificação em tempo constant
- **Tailwind CSS 4 + shadcn/ui (New York)** — tema "Horno": grafite quente + âmbar
- **Recharts** — gráficos com dados reais
- **Sonner** — notificações | **Lucide** — ícones | **Framer Motion** — transições

## Arquitetura de dados

Vendas, pagamentos, produção e estoque são rastreáveis via movimentações (ledger) — nada é apagado silenciosamente:

- Checkout do PDV é **transacional**: venda + itens + pagamentos + caixa + fiado + pontos + pedido no KDS em uma única transação Prisma.
- Recebimento de compra atualiza custo do insumo (recálculo de margem) e gera conta a pagar.
- Conclusão de ordem de produção deduz insumos proporcionalmente (com rollback em falta de estoque) e registra entrada de produto.

## Rodando

```bash
bun install
bun run db:push          # cria o schema no SQLite
bun run prisma/seed.ts   # popula dados de demonstração
bun run dev              # http://localhost:3000
```

### Integração Mercado Pago real

O módulo de pagamentos roda em modo demonstração (cobranças PIX simuladas localmente com o mesmo fluxo de payload/webhook). Para produção, defina `MERCADO_PAGO_ACCESS_TOKEN` no `.env` e troque a implementação de `src/app/api/payments/` pelas chamadas oficiais da API do Mercado Pago — o contrato `POST /api/payments/webhook {"data":{"id"}}` já está pronto para receber as notificações.

## Estrutura

```
src/
├── app/
│   ├── api/            # ~50 endpoints REST protegidos por guard (auth, users, roles, audit + operação)
│   └── page.tsx        # shell único do ERP
├── components/
│   ├── erp/
│   │   ├── shell.tsx            # login e-mail/senha + sessão + menu dinâmico + acesso restrito
│   │   ├── permission-matrix.tsx # editor granular de permissões (usuários e perfis)
│   │   └── views/               # 17 módulos (Dashboard, Pdv, Orders, ..., UsersView admin)
│   └── ui/             # shadcn/ui
└── lib/
    ├── auth/           # permissions (catálogo), password (Argon2id), session, effective, guard, audit, default-roles
    └── ...             # db (Prisma), types (DTOs), api client, format, store (zustand)
prisma/
├── schema.prisma       # 41 modelos
└── seed.ts             # padaria completa + empresa/unidades/perfis/usuários demo
```

---

*BAKERY ERP • Gestão 360° para padarias — Next.js 16 • SQLite • Mercado Pago (demonstração)*
