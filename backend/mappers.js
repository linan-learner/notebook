function rowToRecord(row) {
  const rec = {
    id: row.id,
    type: row.type,
    category: row.category,
    amount: Number(row.amount),
    note: row.note || '',
    account: row.account || '',
    member: row.member || '',
    merchant: row.merchant || '',
    project: row.project || '',
    occurredAt: row.occurred_at,
    createdAt: row.created_at
  }
  if (row.book_id != null) rec.bookId = row.book_id
  return rec
}

function rowToBook(row) {
  const oc = row.owner_column
  return {
    id: row.id,
    name: row.name,
    remark: row.remark || '',
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    collabEnabled: row.collab_enabled == null ? true : Number(row.collab_enabled) !== 0,
    ownerColumn: oc === 'collab' ? 'collab' : 'solo'
  }
}

module.exports = { rowToRecord, rowToBook }
