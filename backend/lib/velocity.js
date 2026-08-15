// ═══════════════════════════════════════════════════════════════
// Cross-Branch Velocity Engine
// Runs nightly. Compares velocity30d across branches and
// generates PENDING StockTransfer recommendations.
// ═══════════════════════════════════════════════════════════════

export async function generateVelocityTransfers(prisma) {
  const created = []

  // Fetch all inventory items with velocity data
  const allItems = await prisma.inventoryItem.findMany({
    include: { product: true, branch: true },
    where: { branch: { isActive: true } },
  })

  // Group by product
  const byProduct = {}
  for (const item of allItems) {
    if (!byProduct[item.productId]) byProduct[item.productId] = []
    byProduct[item.productId].push(item)
  }

  for (const [productId, items] of Object.entries(byProduct)) {
    const product = items[0].product

    // Find slow movers (low velocity, high stock = surplus)
    const donors = items.filter(i =>
      i.velocity30d < 5 &&
      i.quantityOnHand > (product.reorderPoint * 2)
    )

    // Find fast movers (high velocity, low stock = need replenishment)
    const receivers = items.filter(i =>
      i.velocity30d > 12 &&
      i.quantityOnHand <= product.reorderPoint
    )

    for (const receiver of receivers) {
      for (const donor of donors) {
        if (donor.branchId === receiver.branchId) continue

        // Skip if a pending transfer already exists for this route+product
        const existingPending = await prisma.stockTransfer.findFirst({
          where: {
            status: 'PENDING',
            fromBranchId: donor.branchId,
            toBranchId: receiver.branchId,
            lineItems: { some: { productId } },
          },
        })
        if (existingPending) continue

        // Calculate suggested quantity:
        // Enough to cover 30d demand at receiver, capped at 50% of donor surplus
        const daysOfCover = 30
        const receiverMonthlyDemand = Math.ceil(receiver.velocity30d)
        const donorSurplus = donor.quantityOnHand - product.reorderPoint
        const suggestedQty = Math.min(
          Math.ceil(receiverMonthlyDemand * 0.8),
          Math.floor(donorSurplus * 0.5),
          donor.quantityOnHand - product.reorderPoint
        )

        if (suggestedQty <= 0) continue

        const priority = receiver.quantityOnHand === 0 ? 'HIGH'
          : receiver.velocity30d > 25 ? 'HIGH'
          : receiver.velocity30d > 15 ? 'MEDIUM'
          : 'LOW'

        const transfer = await prisma.stockTransfer.create({
          data: {
            fromBranchId: donor.branchId,
            toBranchId: receiver.branchId,
            status: 'PENDING',
            priority,
            recommendedBy: 'SYSTEM',
            notes: `Auto-generated: ${donor.branch.name} vel=${donor.velocity30d}/mo stock=${donor.quantityOnHand} → ${receiver.branch.name} vel=${receiver.velocity30d}/mo stock=${receiver.quantityOnHand}`,
            lineItems: {
              create: [{
                productId,
                quantity: suggestedQty,
              }],
            },
          },
        })

        created.push(transfer)
        break // One donor per receiver per product
      }
    }
  }

  return created
}
