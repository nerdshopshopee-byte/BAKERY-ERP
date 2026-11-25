'use client'

// BAKERY ERP - Matriz de permissões granulares (usuários e perfis de acesso)
// PermissionMatrix: estado por chave (inherit/allow/deny) usado no editor de permissões do usuário.
// RolePermissionMatrix: variante compacta para o editor de perfis (lista de chaves concedidas).
import { useCallback, useMemo, useState } from 'react'
import { ChevronDown, Clock, Lock, RotateCcw, X } from 'lucide-react'

import { PERMISSION_MODULES, type PermissionModuleDef } from '@/lib/auth/permissions'
import { hr } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export type PermState = {
  action: 'inherit' | 'allow' | 'deny'
  expiresAt?: string | null
}

export type PermissionMatrixProps = {
  state: Record<string, PermState>
  onChange: (state: Record<string, PermState>) => void
  rolePermissions: string[]
  readOnly?: boolean
  compact?: boolean
}

export type RolePermissionMatrixProps = {
  selected: string[]
  onChange: (keys: string[]) => void
  readOnly?: boolean
}

// Formata a validade de uma concessão temporária: "22/12 18:00"
function fmtExpiry(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const day = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return `${day} ${hr(d)}`
}

// Botão de concessão temporária por linha (popover com data/hora de expiração)
function TempGrantButton({ onGrant, disabled = false }: { onGrant: (iso: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground size-7"
          disabled={disabled}
          title="Conceder temporariamente"
        >
          <Clock className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <div className="grid gap-2">
          <Label className="text-xs font-medium">Conceder temporariamente</Label>
          <Input
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-8 text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="h-7" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="h-7"
              disabled={!value}
              onClick={() => {
                const date = new Date(value)
                if (Number.isNaN(date.getTime())) return
                onGrant(date.toISOString())
                setValue('')
                setOpen(false)
              }}
            >
              Conceder temporariamente
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

type ModuleCardProps = {
  mod: PermissionModuleDef
  state: Record<string, PermState>
  roleSet: Set<string>
  readOnly: boolean
  compact: boolean
  isEffectiveAllowed: (key: string) => boolean
  setKey: (key: string, next: PermState) => void
  setMany: (keys: string[], action: 'allow' | 'deny') => void
}

// Card de um módulo do catálogo: checkbox mestre, contagem e linhas de permissão
function ModuleCard({ mod, state, roleSet, readOnly, compact, isEffectiveAllowed, setKey, setMany }: ModuleCardProps) {
  const [open, setOpen] = useState(true)
  const keys = mod.permissions.map((p) => p.key)
  const total = keys.length
  const allowed = keys.filter((k) => isEffectiveAllowed(k)).length
  const masterChecked: boolean | 'indeterminate' = allowed === total ? true : allowed === 0 ? false : 'indeterminate'

  return (
    <Card className="gap-0 rounded-xl border bg-card py-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          title={open ? 'Recolher módulo' : 'Expandir módulo'}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronDown className={`size-4 transition-transform ${open ? '' : '-rotate-90'}`} />
        </Button>
        <Checkbox
          id={`perm-master-${mod.key}`}
          checked={masterChecked}
          disabled={readOnly}
          onCheckedChange={(checked) => setMany(keys, checked === true ? 'allow' : 'deny')}
        />
        <div className="min-w-0">
          <Label htmlFor={`perm-master-${mod.key}`} className="cursor-pointer text-sm font-semibold">
            {mod.label}
          </Label>
          {mod.description && <p className="text-muted-foreground text-xs">{mod.description}</p>}
        </div>
        <span className="text-muted-foreground text-xs tabular-nums">
          {allowed}/{total} liberadas
        </span>
        {readOnly && <Lock className="text-muted-foreground size-3.5" />}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={readOnly}
            onClick={() => setMany(keys, 'allow')}
          >
            Marcar todas
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={readOnly}
            onClick={() => setMany(keys, 'deny')}
          >
            Desmarcar todas
          </Button>
        </div>
      </div>
      {open && (
        <div className="grid gap-0.5 px-2 py-2 sm:grid-cols-2">
          {mod.permissions.map((p) => {
            const st = state[p.key]
            const action = st?.action ?? 'inherit'
            return (
              <div
                key={p.key}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Checkbox
                    id={`perm-${p.key}`}
                    checked={isEffectiveAllowed(p.key)}
                    disabled={readOnly}
                    onCheckedChange={(checked) =>
                      setKey(p.key, checked === true ? { action: 'allow', expiresAt: null } : { action: 'deny' })
                    }
                  />
                  <Label htmlFor={`perm-${p.key}`} className="cursor-pointer truncate text-sm font-normal">
                    {p.label}
                  </Label>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {compact ? (
                    action === 'allow' ? (
                      <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary text-[10px]">
                        Liberado
                      </Badge>
                    ) : null
                  ) : action === 'allow' ? (
                    st?.expiresAt ? (
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 bg-amber-500/10 gap-1 text-amber-400 text-[10px]"
                      >
                        <Clock className="size-3" />
                        Temporário · até {fmtExpiry(st.expiresAt)}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary text-[10px]">
                        Extra
                      </Badge>
                    )
                  ) : action === 'deny' ? (
                    <Badge variant="destructive" className="text-[10px]">
                      Restrito
                    </Badge>
                  ) : roleSet.has(p.key) ? (
                    <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
                      <span className="size-1.5 rounded-full bg-amber-400" />
                      Herdado do perfil
                    </span>
                  ) : (
                    <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
                      <X className="size-3" />
                      Herdado do perfil
                    </span>
                  )}
                  {!compact && !readOnly && (
                    <TempGrantButton
                      disabled={readOnly}
                      onGrant={(iso) => setKey(p.key, { action: 'allow', expiresAt: iso })}
                    />
                  )}
                  {!compact && !readOnly && action !== 'inherit' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-foreground size-7"
                      title="Voltar a herdar do perfil"
                      onClick={() => setKey(p.key, { action: 'inherit' })}
                    >
                      <RotateCcw className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

export default function PermissionMatrix({
  state,
  onChange,
  rolePermissions,
  readOnly = false,
  compact = false,
}: PermissionMatrixProps) {
  const roleSet = useMemo(() => new Set(rolePermissions), [rolePermissions])

  const isEffectiveAllowed = useCallback(
    (key: string) => {
      const st = state[key]
      if (!st || st.action === 'inherit') return roleSet.has(key)
      return st.action === 'allow'
    },
    [state, roleSet]
  )

  const setKey = useCallback(
    (key: string, next: PermState) => {
      onChange({ ...state, [key]: next })
    },
    [state, onChange]
  )

  const setMany = useCallback(
    (keys: string[], action: 'allow' | 'deny') => {
      const next: Record<string, PermState> = { ...state }
      for (const k of keys) next[k] = { action, expiresAt: null }
      onChange(next)
    },
    [state, onChange]
  )

  return (
    <div className="max-h-96 space-y-3 overflow-y-auto scrollbar-thin pr-1">
      {PERMISSION_MODULES.map((mod) => (
        <ModuleCard
          key={mod.key}
          mod={mod}
          state={state}
          roleSet={roleSet}
          readOnly={readOnly}
          compact={compact}
          isEffectiveAllowed={isEffectiveAllowed}
          setKey={setKey}
          setMany={setMany}
        />
      ))}
    </div>
  )
}

// Variante para o editor de perfis: trabalha com a lista de chaves selecionadas
export function RolePermissionMatrix({ selected, onChange, readOnly = false }: RolePermissionMatrixProps) {
  const selectedSet = useMemo(() => new Set(selected), [selected])

  const state = useMemo(() => {
    const map: Record<string, PermState> = {}
    for (const mod of PERMISSION_MODULES) {
      for (const p of mod.permissions) {
        map[p.key] = { action: selectedSet.has(p.key) ? 'allow' : 'deny', expiresAt: null }
      }
    }
    return map
  }, [selectedSet])

  const handleChange = useCallback(
    (next: Record<string, PermState>) => {
      const keys: string[] = []
      for (const mod of PERMISSION_MODULES) {
        for (const p of mod.permissions) {
          if (next[p.key]?.action === 'allow') keys.push(p.key)
        }
      }
      onChange(keys)
    },
    [onChange]
  )

  return <PermissionMatrix state={state} onChange={handleChange} rolePermissions={[]} readOnly={readOnly} compact />
}
