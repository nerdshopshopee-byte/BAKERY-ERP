// BAKERY ERP - Cálculo de ficha técnica (custo real, margem e preço sugerido)
// Fonte oficial: ingredientes cadastrados (custo de aquisição atualizado),
// receita (rendimento, mão de obra, embalagem, perda prevista) e modificadores.

import { round2 } from '@/lib/units'

export interface RecipeItemLike {
  ingredientId: string
  qty: number
}

export interface IngredientLike {
  id: string
  costPerUnit: number
  unit: string
}

export interface ModifierLike {
  id?: string
  name: string
  kind: string
  ingredientId: string | null
  qty: number
  unit: string
  extraCost: number
  extraPrice: number
  active: boolean
}

export interface FichaTecnicaInput {
  recipe: {
    id: string
    name: string
    productId: string | null
    yieldQty: number
    unit: string
    laborCost: number
    packagingCost: number
    lossPct: number
    prepTimeMin: number | null
    targetMarginPct: number | null
  }
  items: RecipeItemLike[]
  ingredients: IngredientLike[]
  modifiers?: ModifierLike[]
  salePrice?: number | null // preço atual do produto vinculado
}

export interface FichaTecnica {
  ingredientsCost: number
  laborCost: number
  packagingCost: number
  lossCost: number // custo da perda prevista sobre ingredientes
  totalCost: number // custo total do lote (com perda)
  yieldQty: number
  costPerUnit: number // custo por unidade produzida
  salePrice: number | null
  marginPerUnit: number | null // R$ por unidade (salePrice - costPerUnit)
  marginPct: number | null // % sobre o preço de venda
  targetMarginPct: number | null
  suggestedPrice: number | null // preço p/ atingir margem alvo
  modifierCostsTotal: number // soma dos extras por unidade (informativo)
}

export function computeFichaTecnica(input: FichaTecnicaInput): FichaTecnica {
  const { recipe, items, ingredients } = input
  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]))

  const ingredientsCost = round2(
    items.reduce((acc, item) => {
      const ing = ingredientMap.get(item.ingredientId)
      return acc + item.qty * (ing?.costPerUnit ?? 0)
    }, 0),
  )

  // Perda prevista: % aplicada sobre o custo de ingredientes
  const lossCost = round2(ingredientsCost * (recipe.lossPct / 100))
  const baseCost = round2(ingredientsCost + lossCost + recipe.laborCost + recipe.packagingCost)
  const yieldQty = recipe.yieldQty > 0 ? recipe.yieldQty : 1
  const costPerUnit = round2(baseCost / yieldQty)

  const salePrice = input.salePrice !== null && input.salePrice !== undefined ? round2(input.salePrice) : null
  const marginPerUnit = salePrice !== null ? round2(salePrice - costPerUnit) : null
  const marginPct = salePrice !== null && salePrice > 0
    ? round2(((salePrice - costPerUnit) / salePrice) * 100)
    : null

  const targetMarginPct = recipe.targetMarginPct
  const suggestedPrice = targetMarginPct !== null && targetMarginPct >= 0 && targetMarginPct < 100
    ? round2(costPerUnit / (1 - targetMarginPct / 100))
    : null

  const modifiers = (input.modifiers ?? []).filter((m) => m.active)
  const modifierCostsTotal = round2(
    modifiers.reduce((acc, m) => {
      // Custo default do adicional: qty x custo do insumo (quando informado)
      const computed = m.ingredientId
        ? (ingredientMap.get(m.ingredientId)?.costPerUnit ?? 0) * m.qty
        : 0
      return acc + (m.extraCost > 0 ? m.extraCost : computed)
    }, 0),
  )

  return {
    ingredientsCost,
    laborCost: round2(recipe.laborCost),
    packagingCost: round2(recipe.packagingCost),
    lossCost,
    totalCost: baseCost,
    yieldQty,
    costPerUnit,
    salePrice,
    marginPerUnit,
    marginPct,
    targetMarginPct,
    suggestedPrice,
    modifierCostsTotal,
  }
}
