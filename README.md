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
| **Equipe** | Funcionários com cargos (7 perfis), salários, registro de ponto (entrada/saída) e permissões por perfil |
| **Mercado Pago** | Cobrança PIX (BR Code copia-e-cola), taxas/valor líquido, confirmação via webhook e conciliação — modo demonstração com o mesmo payload da API oficial |

## Perfis de acesso

Proprietário (total), Gerente, Caixa (PDV/caixa/clientes), Padeiro (KDS/produção/estoque), Atendente (PDV/KDS/clientes), Financeiro (dashboard/financeiro/MP/compras), Estoquista (estoque/compras/catálogo/produção).

## Stack

- **Next.js 16 (App Router) + TypeScript** — 36 route handlers de API
- **Prisma + SQLite** — 24 modelos (vendas, pedidos, produção, estoque, financeiro, pagamentos, auditoria)
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
│   ├── api/            # 36 endpoints REST (dashboard, sales, orders, cash, payments...)
│   └── page.tsx        # shell único do ERP
├── components/
│   ├── erp/
│   │   ├── shell.tsx   # login por perfil + navegação + footer
│   │   └── views/      # 12 módulos (Dashboard, Pdv, Orders, Production...)
│   └── ui/             # shadcn/ui
└── lib/                # db (Prisma), types (DTOs), api client, format, store (zustand)
prisma/
├── schema.prisma       # 24 modelos
└── seed.ts             # padaria completa de demonstração
```

---

*BAKERY ERP • Gestão 360° para padarias — Next.js 16 • SQLite • Mercado Pago (demonstração)*
