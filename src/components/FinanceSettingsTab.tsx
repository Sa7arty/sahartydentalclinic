import { FormEvent, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { confirmDialog } from '../lib/confirmDialog'
import { useSettings } from '../context/SettingsContext'
import { ExpenseCategory, ExpenseItem } from '../types'

const card = 'space-y-3 rounded-xl border border-slate-200 bg-white p-4'

/**
 * Finances → Settings: everything that configures the Finances module
 * (currency, the "owes a lot" flag, and the expense categories / items list).
 */
export default function FinanceSettingsTab() {
  const { settings, refresh } = useSettings()

  const [currency, setCurrency] = useState(settings.currency)
  const [bigDebtThreshold, setBigDebtThreshold] = useState(settings.big_debt_threshold)
  const [saving, setSaving] = useState(false)

  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([])
  const [newExpenseCategory, setNewExpenseCategory] = useState('')
  const [expenseItems, setExpenseItems] = useState<ExpenseItem[]>([])
  const [newExpenseItem, setNewExpenseItem] = useState<Record<string, string>>({})

  useEffect(() => {
    setCurrency(settings.currency)
    setBigDebtThreshold(settings.big_debt_threshold)
  }, [settings])

  useEffect(() => {
    loadExpenseCategories()
  }, [])

  async function handleSaveGeneral(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase
      .from('app_settings')
      .update({ currency: currency.trim() || 'EGP', big_debt_threshold: bigDebtThreshold })
      .eq('id', true)
    setSaving(false)
    if (error) alert(error.message)
    else await refresh()
  }

  async function loadExpenseCategories() {
    const { data } = await supabase.from('expense_categories').select('*').order('name')
    setExpenseCategories((data as ExpenseCategory[]) ?? [])
    const { data: items } = await supabase.from('expense_items').select('*').order('name')
    setExpenseItems((items as ExpenseItem[]) ?? [])
  }
  async function handleAddExpenseCategory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = newExpenseCategory.trim()
    if (!name) return
    const { error } = await supabase.from('expense_categories').insert({ name })
    if (error) alert(error.message)
    else {
      setNewExpenseCategory('')
      loadExpenseCategories()
    }
  }
  async function handleDeleteExpenseCategory(id: string) {
    if (!(await confirmDialog('Delete this category and its items?'))) return
    const { error } = await supabase.from('expense_categories').delete().eq('id', id)
    if (error) alert(error.message)
    else loadExpenseCategories()
  }
  async function handleAddExpenseItem(categoryId: string) {
    const name = (newExpenseItem[categoryId] ?? '').trim()
    if (!name) return
    const { error } = await supabase.from('expense_items').insert({ category_id: categoryId, name })
    if (error) alert(error.message)
    else {
      setNewExpenseItem((m) => ({ ...m, [categoryId]: '' }))
      loadExpenseCategories()
    }
  }
  async function handleDeleteExpenseItem(id: string) {
    const { error } = await supabase.from('expense_items').delete().eq('id', id)
    if (error) alert(error.message)
    else loadExpenseCategories()
  }
  async function updateExpenseReq(patch: Record<string, boolean>) {
    const { error } = await supabase.from('app_settings').update(patch).eq('id', true)
    if (error) alert(error.message)
    else await refresh()
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSaveGeneral} className={card}>
        <div>
          <h2 className="font-medium text-navy-900">Currency &amp; balances</h2>
          <p className="text-sm text-slate-500">Currency shown across payments, expenses and balances.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm text-slate-500">Currency</label>
            <input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="EGP" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-500">“Owes a lot” threshold ({currency || 'EGP'})</label>
            <input type="number" min="0" step="1" value={bigDebtThreshold} onChange={(e) => setBigDebtThreshold(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            <p className="mt-0.5 text-[11px] text-slate-400">Patients owing this amount or more get an amber “owes a lot” tag on the Dashboard.</p>
          </div>
        </div>
        <button type="submit" disabled={saving} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>

      <div className={card}>
        <div>
          <h2 className="font-medium text-navy-900">Expense categories &amp; items</h2>
          <p className="text-sm text-slate-500">Categories shown when recording an expense; each category has its own list of items. Choosing a category on the expense form shows only that category's items.</p>
        </div>

        <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm text-navy-800">
            <input type="checkbox" checked={settings.expense_category_required} onChange={(e) => updateExpenseReq({ expense_category_required: e.target.checked })} />
            Category required
          </label>
          <label className="flex items-center gap-2 text-sm text-navy-800">
            <input type="checkbox" checked={settings.expense_item_required} onChange={(e) => updateExpenseReq({ expense_item_required: e.target.checked })} />
            Item required
          </label>
          <label className="flex items-center gap-2 text-sm text-navy-800">
            <input type="checkbox" checked={settings.expense_description_required} onChange={(e) => updateExpenseReq({ expense_description_required: e.target.checked })} />
            Description required
          </label>
        </div>

        <div className="space-y-3">
          {expenseCategories.length === 0 && <p className="text-sm text-slate-500">No categories yet.</p>}
          {expenseCategories.map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-navy-900">{c.name}</p>
                <button onClick={() => handleDeleteExpenseCategory(c.id)} className="text-xs text-red-600 hover:underline">
                  Delete category
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {expenseItems.filter((i) => i.category_id === c.id).length === 0 && <span className="text-xs text-slate-400">No items yet.</span>}
                {expenseItems
                  .filter((i) => i.category_id === c.id)
                  .map((i) => (
                    <span key={i.id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-1.5 text-sm text-navy-800">
                      {i.name}
                      <button onClick={() => handleDeleteExpenseItem(i.id)} title="Remove item" className="rounded-full px-1 text-slate-400 hover:bg-red-100 hover:text-red-600">
                        ×
                      </button>
                    </span>
                  ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={newExpenseItem[c.id] ?? ''}
                  onChange={(e) => setNewExpenseItem((m) => ({ ...m, [c.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddExpenseItem(c.id)
                    }
                  }}
                  placeholder="Add an item to this category"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
                <button onClick={() => handleAddExpenseItem(c.id)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-navy-800 hover:bg-slate-50">
                  + Item
                </button>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleAddExpenseCategory} className="flex gap-2 border-t border-slate-100 pt-3">
          <input
            value={newExpenseCategory}
            onChange={(e) => setNewExpenseCategory(e.target.value)}
            placeholder="New category (e.g. Lab fees)"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">
            Add category
          </button>
        </form>
      </div>
    </div>
  )
}
