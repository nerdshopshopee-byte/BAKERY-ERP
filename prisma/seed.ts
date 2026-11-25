/**
 * BAKERY ERP - Seed de dados demonstrativos
 * Popula o banco com uma padaria completa: catálogo, insumos, receitas,
 * fornecedores, funcionários, clientes, caixa, vendas históricas, pedidos KDS,
 * financeiro e pagamentos PIX.
 *
 * Execução: bun run prisma/seed.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const DAY = 24 * 60 * 60 * 1000
const now = new Date()
const daysAgo = (n: number, h = 8, m = 0) => {
  const d = new Date(now.getTime() - n * DAY)
  d.setHours(h, m, 0, 0)
  return d
}
const todayAt = (h: number, m = 0) => {
  const d = new Date(now.getTime())
  d.setHours(h, m, 0, 0)
  return d
}
const rnd = (min: number, max: number) => Math.random() * (max - min) + min
const round2 = (v: number) => Math.round(v * 100) / 100

async function main() {
  console.log('Limpando banco...')
  await db.auditLog.deleteMany()
  await db.alert.deleteMany()
  await db.payment.deleteMany()
  await db.transaction.deleteMany()
  await db.receivable.deleteMany()
  await db.payable.deleteMany()
  await db.orderItem.deleteMany()
  await db.order.deleteMany()
  await db.salePayment.deleteMany()
  await db.saleItem.deleteMany()
  await db.sale.deleteMany()
  await db.cashMovement.deleteMany()
  await db.cashSession.deleteMany()
  await db.timeLog.deleteMany()
  await db.employee.deleteMany()
  await db.customer.deleteMany()
  await db.purchaseItem.deleteMany()
  await db.purchase.deleteMany()
  await db.supplier.deleteMany()
  await db.productionOrder.deleteMany()
  await db.recipeItem.deleteMany()
  await db.recipe.deleteMany()
  await db.stockMovement.deleteMany()
  await db.ingredient.deleteMany()
  await db.product.deleteMany()
  await db.category.deleteMany()

  // ---------- CATEGORIAS ----------
  const categories = await Promise.all(
    [
      { name: 'Pães', imageUrl: '/products/paes.png', emoji: '🍞', sortOrder: 1 },
      { name: 'Confeitaria', imageUrl: '/products/confeitaria.png', emoji: '🎂', sortOrder: 2 },
      { name: 'Salgados', imageUrl: '/products/salgados.png', emoji: '🥟', sortOrder: 3 },
      { name: 'Doces', imageUrl: '/products/doces.png', emoji: '🍬', sortOrder: 4 },
      { name: 'Cafeteria', imageUrl: '/products/cafe.png', emoji: '☕', sortOrder: 5 },
      { name: 'Lanches', imageUrl: '/products/lanches.png', emoji: '🥪', sortOrder: 6 },
      { name: 'Tortas', imageUrl: '/products/tortas.png', emoji: '🥧', sortOrder: 7 },
      { name: 'Especiais', imageUrl: '/products/especiais.png', emoji: '⭐', sortOrder: 8 },
    ].map((c) => db.category.create({ data: c }))
  )
  const cat = (name: string) => categories.find((c) => c.name === name)!.id

  // ---------- PRODUTOS ----------
  const productData = [
    // Pães
    { name: 'Pão Francês', categoryId: cat('Pães'), unit: 'UN', price: 0.79, cost: 0.31, byWeight: false, barcode: '7891000000011' },
    { name: 'Pão Integral', categoryId: cat('Pães'), unit: 'UN', price: 1.29, cost: 0.52, barcode: '7891000000028' },
    { name: 'Pão de Queijo', categoryId: cat('Pães'), unit: 'UN', price: 3.5, cost: 1.4, barcode: '7891000000035' },
    { name: 'Baguete', categoryId: cat('Pães'), unit: 'UN', price: 4.9, cost: 1.9, barcode: '7891000000042' },
    { name: 'Bisnaguinha', categoryId: cat('Pães'), unit: 'UN', price: 0.89, cost: 0.35, barcode: '7891000000059' },
    { name: 'Pão Australiano', categoryId: cat('Pães'), unit: 'UN', price: 1.59, cost: 0.64, barcode: '7891000000066' },
    // Confeitaria
    { name: 'Bolo de Cenoura c/ Chocolate', categoryId: cat('Confeitaria'), unit: 'UN', price: 12.9, cost: 4.8, barcode: '7891000000073' },
    { name: 'Bolo de Chocolate', categoryId: cat('Confeitaria'), unit: 'UN', price: 11.5, cost: 4.2, barcode: '7891000000080' },
    { name: 'Bolo de Fubá', categoryId: cat('Confeitaria'), unit: 'UN', price: 9.9, cost: 3.4, barcode: '7891000000097' },
    { name: 'Brownie', categoryId: cat('Confeitaria'), unit: 'UN', price: 6.5, cost: 2.2, barcode: '7891000000103' },
    { name: 'Bolo Aniversário Personalizado (kg)', categoryId: cat('Confeitaria'), unit: 'KG', price: 68.0, cost: 26.0, byWeight: true, barcode: '7891000000110' },
    // Salgados
    { name: 'Coxinha', categoryId: cat('Salgados'), unit: 'UN', price: 5.5, cost: 1.9, barcode: '7891000000127' },
    { name: 'Risole de Carne', categoryId: cat('Salgados'), unit: 'UN', price: 5.5, cost: 1.8, barcode: '7891000000134' },
    { name: 'Pastel de Queijo', categoryId: cat('Salgados'), unit: 'UN', price: 6.0, cost: 2.1, barcode: '7891000000141' },
    { name: 'Kibe', categoryId: cat('Salgados'), unit: 'UN', price: 5.0, cost: 1.7, barcode: '7891000000158' },
    { name: 'Empada de Frango', categoryId: cat('Salgados'), unit: 'UN', price: 6.5, cost: 2.3, barcode: '7891000000165' },
    // Doces
    { name: 'Brigadeiro Gourmet', categoryId: cat('Doces'), unit: 'UN', price: 3.9, cost: 1.2, barcode: '7891000000172' },
    { name: 'Beijinho', categoryId: cat('Doces'), unit: 'UN', price: 3.5, cost: 1.1, barcode: '7891000000189' },
    { name: 'Cajuzinho', categoryId: cat('Doces'), unit: 'UN', price: 3.9, cost: 1.3, barcode: '7891000000196' },
    { name: 'Trufa de Chocolate', categoryId: cat('Doces'), unit: 'UN', price: 4.5, cost: 1.5, barcode: '7891000000202' },
    { name: 'Quindim', categoryId: cat('Doces'), unit: 'UN', price: 5.5, cost: 1.8, barcode: '7891000000219' },
    // Cafeteria
    { name: 'Café Expresso', categoryId: cat('Cafeteria'), unit: 'UN', price: 4.5, cost: 0.9, barcode: '7891000000226' },
    { name: 'Cappuccino', categoryId: cat('Cafeteria'), unit: 'UN', price: 7.5, cost: 1.8, barcode: '7891000000233' },
    { name: 'Pão de Mel', categoryId: cat('Cafeteria'), unit: 'UN', price: 4.0, cost: 1.3, barcode: '7891000000240' },
    { name: 'Suco de Laranja 500ml', categoryId: cat('Cafeteria'), unit: 'UN', price: 9.5, cost: 3.2, barcode: '7891000000257' },
    { name: 'Chá Gelado 500ml', categoryId: cat('Cafeteria'), unit: 'UN', price: 7.0, cost: 1.9, barcode: '7891000000264' },
    // Lanches
    { name: 'Pão na Chapa', categoryId: cat('Lanches'), unit: 'UN', price: 6.5, cost: 1.8, barcode: '7891000000271' },
    { name: 'Misto Quente', categoryId: cat('Lanches'), unit: 'UN', price: 8.5, cost: 2.7, barcode: '7891000000288' },
    { name: 'Sanduíche Natural', categoryId: cat('Lanches'), unit: 'UN', price: 9.9, cost: 3.1, barcode: '7891000000295' },
    { name: 'Tapioca c/ Queijo', categoryId: cat('Lanches'), unit: 'UN', price: 8.0, cost: 2.4, barcode: '7891000000301' },
    // Tortas
    { name: 'Torta de Limão (fatia)', categoryId: cat('Tortas'), unit: 'UN', price: 8.9, cost: 2.9, barcode: '7891000000318' },
    { name: 'Torta de Morango (fatia)', categoryId: cat('Tortas'), unit: 'UN', price: 10.9, cost: 3.5, barcode: '7891000000325' },
    { name: 'Cheesecake (fatia)', categoryId: cat('Tortas'), unit: 'UN', price: 12.5, cost: 4.1, barcode: '7891000000332' },
    // Especiais
    { name: 'Rosca Doce', categoryId: cat('Especiais'), unit: 'UN', price: 7.9, cost: 2.6, barcode: '7891000000349' },
    { name: 'Kolache', categoryId: cat('Especiais'), unit: 'UN', price: 6.9, cost: 2.2, barcode: '7891000000356' },
    { name: 'Croissant', categoryId: cat('Especiais'), unit: 'UN', price: 7.5, cost: 2.4, barcode: '7891000000363' },
  ]
  const products = await Promise.all(productData.map((p) => db.product.create({ data: p })))

  // ---------- FORNECEDORES ----------
  const supplierData = [
    { name: 'Moinho Santista Distribuidora', contact: 'Marcos Ferreira', phone: '(11) 3355-1200', email: 'vendas@moinhosantista.com.br', items: 'Farinhas, misturas prontas' },
    { name: 'Casa do Padeiro Insumos', contact: 'Juliana Rocha', phone: '(11) 2255-3344', email: 'comercial@casadopadeiro.com.br', items: 'Fermento, melhoradores, aromas' },
    { name: 'Fazenda Bom Leite', contact: 'Rafael Torres', phone: '(19) 3444-8800', email: 'pedidos@fazendabomleite.com.br', items: 'Leite, manteiga, queijo, ovos' },
    { name: 'Doces & Cia Embalagens', contact: 'Camila Duarte', phone: '(11) 99122-4567', email: 'camila@docesecia.com.br', items: 'Embalagens, caixas, impressos' },
    { name: 'Torrefação Serrana', contact: 'Pedro Alves', phone: '(31) 3555-9090', email: 'contato@torrefacaoserrana.com.br', items: 'Café em grão, cappuccino em pó' },
  ]
  const suppliers = await Promise.all(supplierData.map((s) => db.supplier.create({ data: s })))

  // ---------- INSUMOS ----------
  const ingredientData = [
    { name: 'Farinha de Trigo Especial', unit: 'KG', costPerUnit: 3.85, stock: 142, minStock: 60, supplierId: suppliers[0].id },
    { name: 'Farinha Integral', unit: 'KG', costPerUnit: 5.4, stock: 38, minStock: 25, supplierId: suppliers[0].id },
    { name: 'Açúcar Refinado', unit: 'KG', costPerUnit: 4.2, stock: 55, minStock: 30, supplierId: suppliers[0].id },
    { name: 'Fermento Biológico Seco', unit: 'PCT', costPerUnit: 6.5, stock: 18, minStock: 12, supplierId: suppliers[1].id },
    { name: 'Sal Refinado', unit: 'KG', costPerUnit: 2.1, stock: 24, minStock: 10, supplierId: suppliers[0].id },
    { name: 'Manteiga sem Sal', unit: 'KG', costPerUnit: 42.0, stock: 9.5, minStock: 8, supplierId: suppliers[2].id },
    { name: 'Ovos', unit: 'UN', costPerUnit: 0.72, stock: 320, minStock: 180, supplierId: suppliers[2].id },
    { name: 'Leite Integral', unit: 'L', costPerUnit: 5.3, stock: 46, minStock: 30, supplierId: suppliers[2].id },
    { name: 'Queijo Muçarela', unit: 'KG', costPerUnit: 38.0, stock: 12, minStock: 10, supplierId: suppliers[2].id },
    { name: 'Chocolate em Pó 50%', unit: 'KG', costPerUnit: 28.0, stock: 14, minStock: 8, supplierId: suppliers[1].id },
    { name: 'Chocolate Cobertura Meio Amargo', unit: 'KG', costPerUnit: 46.0, stock: 6.2, minStock: 6, supplierId: suppliers[1].id },
    { name: 'Óleo de Soja', unit: 'L', costPerUnit: 7.8, stock: 21, minStock: 12, supplierId: suppliers[0].id },
    { name: 'Polvilho Azedo', unit: 'KG', costPerUnit: 12.5, stock: 11, minStock: 8, supplierId: suppliers[1].id },
    { name: 'Café Torrado e Moído', unit: 'KG', costPerUnit: 42.0, stock: 7.5, minStock: 5, supplierId: suppliers[4].id },
    { name: 'Embalagem Sacola Kraft P', unit: 'PCT', costPerUnit: 18.0, stock: 4, minStock: 6, supplierId: suppliers[3].id },
    { name: 'Caixa para Bolo', unit: 'UN', costPerUnit: 2.4, stock: 120, minStock: 60, supplierId: suppliers[3].id },
  ]
  const ingredients = await Promise.all(ingredientData.map((i) => db.ingredient.create({ data: i })))
  const ing = (name: string) => ingredients.find((i) => i.name === name)!.id
  const prod = (name: string) => products.find((p) => p.name === name)!.id

  // ---------- RECEITAS / FICHAS TÉCNICAS ----------
  const recipe1 = await db.recipe.create({
    data: {
      name: 'Pão Francês - Massa Padrão',
      productId: prod('Pão Francês'),
      yieldQty: 200,
      unit: 'UN',
      laborCost: 45,
      notes: 'Fermentação de 1h30 em câmara quente. Fornada 220°C por 22min.',
      items: {
        create: [
          { ingredientId: ing('Farinha de Trigo Especial'), qty: 18 },
          { ingredientId: ing('Sal Refinado'), qty: 0.36 },
          { ingredientId: ing('Fermento Biológico Seco'), qty: 0.36 },
          { ingredientId: ing('Óleo de Soja'), qty: 0.5 },
        ],
      },
    },
  })
  const recipe2 = await db.recipe.create({
    data: {
      name: 'Bolo de Cenoura c/ Chocolate',
      productId: prod('Bolo de Cenoura c/ Chocolate'),
      yieldQty: 8,
      unit: 'UN',
      laborCost: 22,
      notes: 'Massa batida por 12min. Calda de chocolate meio amargo.',
      items: {
        create: [
          { ingredientId: ing('Farinha de Trigo Especial'), qty: 2.4 },
          { ingredientId: ing('Açúcar Refinado'), qty: 2.2 },
          { ingredientId: ing('Ovos'), qty: 10 },
          { ingredientId: ing('Óleo de Soja'), qty: 1.1 },
          { ingredientId: ing('Chocolate em Pó 50%'), qty: 0.6 },
          { ingredientId: ing('Chocolate Cobertura Meio Amargo'), qty: 1.2 },
        ],
      },
    },
  })
  const recipe3 = await db.recipe.create({
    data: {
      name: 'Pão de Queijo Mineiro',
      productId: prod('Pão de Queijo'),
      yieldQty: 120,
      unit: 'UN',
      laborCost: 30,
      items: {
        create: [
          { ingredientId: ing('Polvilho Azedo'), qty: 2.5 },
          { ingredientId: ing('Queijo Muçarela'), qty: 1.8 },
          { ingredientId: ing('Leite Integral'), qty: 2.0 },
          { ingredientId: ing('Óleo de Soja'), qty: 0.8 },
          { ingredientId: ing('Ovos'), qty: 8 },
          { ingredientId: ing('Sal Refinado'), qty: 0.08 },
        ],
      },
    },
  })
  const recipe4 = await db.recipe.create({
    data: {
      name: 'Coxinha de Frango - Lote 100un',
      productId: prod('Coxinha'),
      yieldQty: 100,
      unit: 'UN',
      laborCost: 55,
      notes: 'Inclui massa e recheio. Fritura 180°C.',
      items: {
        create: [
          { ingredientId: ing('Farinha de Trigo Especial'), qty: 4.0 },
          { ingredientId: ing('Ovos'), qty: 12 },
          { ingredientId: ing('Óleo de Soja'), qty: 3.5 },
          { ingredientId: ing('Leite Integral'), qty: 2.5 },
          { ingredientId: ing('Sal Refinado'), qty: 0.1 },
        ],
      },
    },
  })

  // ---------- FUNCIONÁRIOS ----------
  const employees = await Promise.all(
    [
      { name: 'Ricardo Almeida', role: 'PROPRIETARIO', salary: 12500, phone: '(11) 98888-1010', hiredAt: daysAgo(920) },
      { name: 'Fabiana Souza', role: 'GERENTE', salary: 4800, phone: '(11) 98888-2020', hiredAt: daysAgo(610) },
      { name: 'Carlos Nunes', role: 'CAIXA', salary: 2200, phone: '(11) 98888-3030', hiredAt: daysAgo(380) },
      { name: 'Dona Cecília', role: 'PADEIRO', salary: 3100, phone: '(11) 98888-4040', hiredAt: daysAgo(1450) },
      { name: 'Marcos Padeiro', role: 'PADEIRO', salary: 2950, phone: '(11) 98888-5050', hiredAt: daysAgo(540) },
      { name: 'Aline Costa', role: 'ATENDENTE', salary: 1900, phone: '(11) 98888-6060', hiredAt: daysAgo(210) },
      { name: 'Julio Prado', role: 'ESTOQUISTA', salary: 2150, phone: '(11) 98888-7070', hiredAt: daysAgo(120) },
      { name: 'Sandra Lima', role: 'FINANCEIRO', salary: 3600, phone: '(11) 98888-8080', hiredAt: daysAgo(430) },
    ].map((e) => db.employee.create({ data: e }))
  )

  // Ponto de hoje
  for (const emp of employees.slice(2, 7)) {
    await db.timeLog.create({ data: { employeeId: emp.id, checkIn: todayAt(5, 30), checkOut: Math.random() > 0.5 ? todayAt(13, 30) : null } })
  }

  // ---------- CLIENTES ----------
  const customers = await Promise.all(
    [
      { name: 'Maria Helena Ramos', phone: '(11) 97777-1111', address: 'Rua das Palmeiras, 120', points: 320, birthday: '12/03' },
      { name: 'João Pedro Dias', phone: '(11) 97777-2222', address: 'Av. Brasil, 455', points: 145, birthday: '28/07' },
      { name: 'Escola Cantinho Feliz', phone: '(11) 3477-9090', address: 'Rua São Jorge, 78', points: 560, notes: 'Pedidos de salgados semanais' },
      { name: 'Ana Beatriz Rocha', phone: '(11) 97777-3333', address: 'Rua Ipê, 302', points: 88, birthday: '05/11' },
      { name: 'Lanches do Zé', phone: '(11) 99555-4321', address: 'Praça Central, 12', points: 210, notes: 'Revenda de pães diária' },
      { name: 'Sofia Martins', phone: '(11) 97777-4444', points: 42, birthday: '19/09' },
    ].map((c) => db.customer.create({ data: c }))
  )
  await db.customer.update({ where: { id: customers[2].id }, data: { creditBalance: 186.4 } })
  await db.customer.update({ where: { id: customers[4].id }, data: { creditBalance: 92.8 } })

  // ---------- MOVIMENTAÇÕES DE ESTOQUE INICIAIS ----------
  for (const i of ingredients.slice(0, 12)) {
    await db.stockMovement.create({
      data: { itemType: 'INGREDIENT', ingredientId: i.id, type: 'ENTRADA', qty: i.stock, unitCost: i.costPerUnit, reason: 'Estoque inicial', createdAt: daysAgo(10) },
    })
  }

  // ---------- CAIXA ----------
  const session = await db.cashSession.create({
    data: { operatorName: 'Carlos Nunes', openingBalance: 300, status: 'ABERTO', openedAt: todayAt(5, 0) },
  })

  // ---------- VENDAS HISTÓRICAS (14 dias) ----------
  console.log('Gerando vendas históricas...')
  const methods = ['DINHEIRO', 'PIX', 'DEBITO', 'CREDITO', 'VALE']
  let saleSeq = 4100
  for (let d = 14; d >= 0; d--) {
    const isToday = d === 0
    const count = Math.floor(rnd(9, 18))
    for (let s = 0; s < count; s++) {
      saleSeq++
      const code = String(saleSeq)
      const cust = Math.random() > 0.7 ? customers[Math.floor(Math.random() * customers.length)] : null
      const itemCount = Math.floor(rnd(1, 4))
      const items: { productId: string; name: string; qty: number; unitPrice: number; unit: string; subtotal: number }[] = []
      let total = 0
      for (let it = 0; it < itemCount; it++) {
        const p = products[Math.floor(Math.random() * products.length)]
        const qty = p.byWeight ? round2(rnd(0.5, 2)) : Math.floor(rnd(1, 5))
        const subtotal = round2(qty * p.price)
        items.push({ productId: p.id, name: p.name, qty, unitPrice: p.price, unit: p.unit, subtotal })
        total += subtotal
      }
      const discount = Math.random() > 0.85 ? round2(total * 0.05) : 0
      total = round2(total - discount)
      const method = methods[Math.floor(Math.random() * methods.length)]
      const hour = isToday ? Math.floor(rnd(6, Math.min(17, now.getHours()))) : Math.floor(rnd(6, 17))
      const minute = Math.floor(rnd(0, 59))
      const createdAt = isToday ? todayAt(hour, minute) : daysAgo(d, hour, minute)
      const sale = await db.sale.create({
        data: {
          code,
          customerId: cust?.id ?? null,
          customer: cust?.name ?? null,
          sessionId: isToday ? session.id : null,
          total,
          discount,
          channel: Math.random() > 0.9 ? 'DELIVERY' : 'BALCAO',
          operator: employees[2].name,
          createdAt,
          items: { create: items },
          payments: { create: [{ method, amount: total }] },
        },
      })
      if (method === 'DINHEIRO' && isToday) {
        await db.cashMovement.create({ data: { sessionId: session.id, type: 'VENDA', method: 'DINHEIRO', amount: total, description: `Venda ${code}`, refId: sale.id, createdAt } })
      }
      // Pedidos KDS para vendas de hoje (parte entra em produção)
      if (isToday && Math.random() > 0.45) {
        const status = Math.random() > 0.6 ? 'PRONTO' : Math.random() > 0.4 ? 'PREPARANDO' : 'AGUARDANDO'
        await db.order.create({
          data: {
            code: `P${code}`,
            customerName: cust?.name ?? 'Cliente Balcão',
            source: sale.channel,
            status,
            saleId: sale.id,
            createdAt,
            expectedAt: new Date(createdAt.getTime() + 25 * 60 * 1000),
            startedAt: status !== 'AGUARDANDO' ? createdAt : null,
            readyAt: status === 'PRONTO' ? new Date(createdAt.getTime() + 20 * 60 * 1000) : null,
            items: { create: items.slice(0, 2).map((i2) => ({ productId: i2.productId, name: i2.name, qty: i2.qty })) },
          },
        })
      }
    }
  }

  // ---------- PEDIDOS KDS ENCOMENDAS ----------
  const encomenda = await db.order.create({
    data: {
      code: 'ENC-1042',
      customerName: 'Maria Helena Ramos',
      phone: '(11) 97777-1111',
      source: 'ENCOMENDA',
      status: 'AGUARDANDO',
      notes: 'Bolo de aniversário - escrita "Parabéns Sofia" em azul',
      expectedAt: new Date(now.getTime() + 3 * DAY),
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      items: {
        create: [
          { productId: prod('Bolo Aniversário Personalizado (kg)'), name: 'Bolo Aniversário Personalizado (kg)', qty: 3, notes: 'Massa branco com morango' },
          { productId: prod('Brigadeiro Gourmet'), name: 'Brigadeiro Gourmet', qty: 50 },
        ],
      },
    },
  })
  await db.order.create({
    data: {
      code: 'ENC-1043',
      customerName: 'Escola Cantinho Feliz',
      phone: '(11) 3477-9090',
      source: 'ENCOMENDA',
      status: 'PREPARANDO',
      notes: 'Turma de 30 crianças - para quinta-feira',
      expectedAt: new Date(now.getTime() + 1 * DAY),
      startedAt: new Date(now.getTime() - 30 * 60 * 1000),
      createdAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
      items: {
        create: [
          { productId: prod('Coxinha'), name: 'Coxinha', qty: 60 },
          { productId: prod('Risole de Carne'), name: 'Risole de Carne', qty: 40 },
          { productId: prod('Suco de Laranja 500ml'), name: 'Suco de Laranja 500ml', qty: 30 },
        ],
      },
    },
  })
  await db.order.create({
    data: {
      code: 'ENC-1041',
      customerName: 'Ana Beatriz Rocha',
      source: 'DELIVERY',
      status: 'PRONTO',
      createdAt: new Date(now.getTime() - 90 * 60 * 1000),
      startedAt: new Date(now.getTime() - 80 * 60 * 1000),
      readyAt: new Date(now.getTime() - 20 * 60 * 1000),
      items: { create: [{ productId: prod('Misto Quente'), name: 'Misto Quente', qty: 2 }, { productId: prod('Cappuccino'), name: 'Cappuccino', qty: 2 }] },
    },
  })

  // ---------- ORDENS DE PRODUÇÃO ----------
  await db.productionOrder.create({
    data: { code: 'OP-2024-081', recipeId: recipe1.id, recipeName: recipe1.name, plannedQty: 200, status: 'PLANEJADA', notes: 'Produção da manhã de amanhã', createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
  })
  await db.productionOrder.create({
    data: { code: 'OP-2024-080', recipeId: recipe3.id, recipeName: recipe3.name, plannedQty: 120, producedQty: 120, status: 'CONCLUIDA', operator: 'Dona Cecília', startedAt: todayAt(4, 30), finishedAt: todayAt(7, 15), createdAt: daysAgo(1, 18) },
  })
  await db.productionOrder.create({
    data: { code: 'OP-2024-079', recipeId: recipe2.id, recipeName: recipe2.name, plannedQty: 12, status: 'EM_ANDAMENTO', operator: 'Marcos Padeiro', startedAt: new Date(now.getTime() - 40 * 60 * 1000), createdAt: daysAgo(1, 16) },
  })
  await db.productionOrder.create({
    data: { code: 'OP-2024-078', recipeId: recipe4.id, recipeName: recipe4.name, plannedQty: 100, producedQty: 96, status: 'CONCLUIDA', operator: 'Dona Cecília', startedAt: daysAgo(1, 5), finishedAt: daysAgo(1, 10, 30), createdAt: daysAgo(2, 15) },
  })

  // ---------- COMPRAS ----------
  const purchase1 = await db.purchase.create({
    data: {
      code: 'PC-0544',
      supplierId: suppliers[0].id,
      supplier: suppliers[0].name,
      status: 'PENDENTE',
      createdAt: new Date(now.getTime() - 26 * 60 * 60 * 1000),
      notes: 'Entrega prevista quinta-feira de manhã',
      items: {
        create: [
          { ingredientId: ing('Farinha de Trigo Especial'), name: 'Farinha de Trigo Especial', unit: 'KG', qty: 120, unitCost: 3.85 },
          { ingredientId: ing('Açúcar Refinado'), name: 'Açúcar Refinado', unit: 'KG', qty: 30, unitCost: 4.2 },
        ],
      },
    },
  })
  await db.purchase.update({ where: { id: purchase1.id }, data: { total: round2(120 * 3.85 + 30 * 4.2) } })
  const purchase2 = await db.purchase.create({
    data: {
      code: 'PC-0543',
      supplierId: suppliers[2].id,
      supplier: suppliers[2].name,
      status: 'RECEBIDA',
      receivedAt: daysAgo(2, 10),
      createdAt: daysAgo(4, 9),
      items: {
        create: [
          { ingredientId: ing('Ovos'), name: 'Ovos', unit: 'UN', qty: 360, unitCost: 0.7 },
          { ingredientId: ing('Leite Integral'), name: 'Leite Integral', unit: 'L', qty: 40, unitCost: 5.25 },
          { ingredientId: ing('Manteiga sem Sal'), name: 'Manteiga sem Sal', unit: 'KG', qty: 10, unitCost: 41.5 },
        ],
      },
    },
  })
  await db.purchase.update({ where: { id: purchase2.id }, data: { total: round2(360 * 0.7 + 40 * 5.25 + 10 * 41.5) } })

  // ---------- FINANCEIRO ----------
  const payableData = [
    { description: 'Fornecedor Moinho Santista - Pedido PC-0544', supplier: suppliers[0].name, category: 'INSUMOS', amount: 588, dueDate: new Date(now.getTime() + 3 * DAY) },
    { description: 'Aluguel do imóvel - Novembro', category: 'ALUGUEL', amount: 3800, dueDate: new Date(now.getTime() + 5 * DAY) },
    { description: 'Conta de energia elétrica', category: 'ENERGIA', amount: 1420.75, dueDate: daysAgo(-2, 0) },
    { description: 'Taxas Mercado Pago - quinzena', category: 'TAXAS', amount: 268.4, dueDate: new Date(now.getTime() + 7 * DAY) },
    { description: 'Folha de pagamento 1ª parcela', category: 'FOLHA', amount: 16400, dueDate: new Date(now.getTime() + 8 * DAY) },
    { description: 'Fazenda Bom Leite - PC-0543', supplier: suppliers[2].name, category: 'INSUMOS', amount: 1087.0, dueDate: daysAgo(1, 0) },
    { description: 'Internet e telefone', category: 'OUTROS', amount: 189.9, dueDate: daysAgo(2, 0) },
  ]
  for (const p of payableData) {
    await db.payable.create({
      data: { ...p, status: p.dueDate < now ? 'PENDENTE' : 'PENDENTE', paidAt: null, createdAt: daysAgo(6) },
    })
  }
  await db.payable.create({ data: { description: 'Doces & Cia Embalagens - PC-0541', supplier: suppliers[3].name, category: 'INSUMOS', amount: 342.0, dueDate: daysAgo(3), status: 'PAGO', paidAt: daysAgo(3), createdAt: daysAgo(10) } })

  const receivableData = [
    { description: 'Fiado - Escola Cantinho Feliz (salgados semanais)', customer: customers[2].name, customerId: customers[2].id, amount: 186.4, dueDate: new Date(now.getTime() + 4 * DAY) },
    { description: 'Fiado - Lanches do Zé', customer: customers[4].name, customerId: customers[4].id, amount: 92.8, dueDate: new Date(now.getTime() + 2 * DAY) },
    { description: 'Encomenda ENC-1042 - sinal 40%', customer: customers[0].name, customerId: customers[0].id, amount: 240.0, dueDate: new Date(now.getTime() + 1 * DAY) },
  ]
  for (const r of receivableData) {
    await db.receivable.create({ data: { ...r, status: 'PENDENTE', createdAt: daysAgo(4) } })
  }
  await db.receivable.create({ data: { description: 'Bolo festas setembre - Maria Helena', customer: customers[0].name, customerId: customers[0].id, amount: 150.0, dueDate: daysAgo(5), status: 'RECEBIDO', paidAt: daysAgo(5), createdAt: daysAgo(12) } })

  // Transações de fluxo de caixa (14 dias)
  console.log('Gerando transações financeiras...')
  for (let d = 14; d >= 0; d--) {
    const revenue = round2(rnd(620, 1500))
    await db.transaction.create({ data: { type: 'RECEITA', category: 'VENDAS', description: `Vendas do balcão - ${daysAgo(d).toLocaleDateString('pt-BR')}`, amount: revenue, method: 'MIXTO', date: daysAgo(d, 18) } })
    if (d % 3 === 0) {
      await db.transaction.create({ data: { type: 'DESPESA', category: 'INSUMOS', description: 'Compra de insumos', amount: round2(rnd(180, 520)), date: daysAgo(d, 10) } })
    }
  }
  await db.transaction.create({ data: { type: 'DESPESA', category: 'ALUGUEL', description: 'Aluguel do imóvel', amount: 3800, date: daysAgo(12, 9) } })
  await db.transaction.create({ data: { type: 'DESPESA', category: 'ENERGIA', description: 'Energia elétrica', amount: 1420.75, date: daysAgo(9, 9) } })
  await db.transaction.create({ data: { type: 'DESPESA', category: 'FOLHA', description: 'Adiantamento de salários', amount: 8200, date: daysAgo(7, 9) } })
  await db.transaction.create({ data: { type: 'RECEITA', category: 'OUTROS', description: 'Festas e eventos (salão)', amount: 1450, date: daysAgo(6, 14) } })

  // ---------- PAGAMENTOS MERCADO PAGO ----------
  await db.payment.create({
    data: {
      externalId: 'MP-10238765432',
      method: 'PIX',
      amount: 186.4,
      fee: 0,
      netAmount: 186.4,
      status: 'PENDENTE',
      pixCode: '00020126580014BR.GOV.BCB.PIX0136b4e0-1f2a-4c8d-9e2f-a1b2c3d4e5f65204000053039865405186.405802BR5915PADARIA PAO DOURADO6009SAO PAULO62070503***6304A1B2',
      description: 'Fiado - Escola Cantinho Feliz',
      customerId: customers[2].id,
      createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
    },
  })
  await db.payment.create({
    data: {
      externalId: 'MP-10238765111',
      method: 'CREDITO',
      amount: 68.0,
      fee: 3.54,
      netAmount: 64.46,
      status: 'PAGO',
      description: 'Bolo personalizado - sinal',
      customerId: customers[0].id,
      createdAt: daysAgo(1, 15),
      paidAt: daysAgo(1, 15),
    },
  })
  await db.payment.create({
    data: {
      externalId: 'MP-10238764801',
      method: 'PIX',
      amount: 45.5,
      fee: 0,
      netAmount: 45.5,
      status: 'PAGO',
      description: 'Venda balcão PIX',
      createdAt: daysAgo(1, 12),
      paidAt: daysAgo(1, 12),
    },
  })

  // ---------- ALERTAS ----------
  await db.alert.create({ data: { level: 'CRITICAL', title: 'Estoque crítico', message: 'Chocolate Cobertura Meio Amargo abaixo do mínimo (6.2 KG / mín 6 KG)', createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000) } })
  await db.alert.create({ data: { level: 'WARNING', title: 'Compra pendente', message: 'PC-0544 do Moinho Santista aguarda recebimento', createdAt: new Date(now.getTime() - 20 * 60 * 60 * 1000) } })
  await db.alert.create({ data: { level: 'WARNING', title: 'Conta a vencer', message: 'Energia elétrica vence hoje - R$ 1.420,75', createdAt: new Date(now.getTime() - 5 * 60 * 60 * 1000) } })

  await db.auditLog.create({ data: { actor: 'Carlos Nunes', action: 'OPEN_CASH', entity: 'CashSession', detail: 'Abertura de caixa com R$ 300,00' } })

  console.log('Seed concluído com sucesso!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
