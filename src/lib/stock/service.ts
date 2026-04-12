import { db } from "@/db";
import {
  products,
  salesOrders,
  salesOrderItems,
  inventoryTransactions,
  stockReservations,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { SalesOrderStatus } from "@/db/schema";

// ─── Stock Cutoff ─────────────────────────────────────────────────────────────

/**
 * Orders before this date are imported for history but do NOT create stock
 * reservations or deductions. Stock was manually baselined on 4 Apr 2026,
 * so only orders from 5 Apr 2026 UTC onwards should affect inventory.
 *
 * Used by all channel handlers (WooCommerce, Amazon, etc.) when calling
 * processOrderStockChange() after fetching orders.
 */
export const STOCK_CUTOFF_DATE = new Date("2026-04-05T00:00:00Z");

// ─── Status Groups ────────────────────────────────────────────────────────────

/** Statuses where stock is reserved (order is active but not yet delivered) */
const RESERVED_STATUSES: SalesOrderStatus[] = [
  "pending",
  "processing",
  "on-hold",
  "packed",
  "shipped",
];

/** Statuses where the reservation should be released (order was cancelled/denied) */
const RELEASE_STATUSES: SalesOrderStatus[] = ["cancelled", "refunded", "failed"];

/** Status where stock is committed (delivered to customer) */
const COMMIT_STATUS: SalesOrderStatus = "delivered";

/** Status where the customer returned the order (admin action needed) */
const RETURN_STATUS: SalesOrderStatus = "returned";

// ─── Core Service ─────────────────────────────────────────────────────────────

/**
 * Central entry point for all order-driven stock changes.
 *
 * Determines the stock action based on the status transition and executes it
 * atomically. Called by:
 * - fetchAndSaveOrders() — after saving each new order
 * - Webhook route — on order.created / order.updated / order.cancelled
 *
 * Idempotent: uses stockProcessed flag + reservation status to prevent
 * double-processing. Safe to call multiple times for the same transition.
 */
export async function processOrderStockChange(
  orderId: number,
  newStatus: SalesOrderStatus,
  oldStatus: SalesOrderStatus | null,
  userId: number,
): Promise<void> {
  // No-op if status hasn't actually changed
  if (oldStatus && oldStatus === newStatus) return;

  // Determine the action
  const wasReserved = oldStatus && RESERVED_STATUSES.includes(oldStatus);
  const isNowReserved = RESERVED_STATUSES.includes(newStatus);
  const isNowCommitted = newStatus === COMMIT_STATUS;
  const isNowReleased = RELEASE_STATUSES.includes(newStatus);
  const isNowReturned = newStatus === RETURN_STATUS;

  // New order arriving in a reserved state → create reservations
  if (!oldStatus && isNowReserved) {
    await reserveStock(orderId, userId);
    return;
  }

  // New order arriving already delivered → commit directly (no intermediate reservation)
  if (!oldStatus && isNowCommitted) {
    await commitStockDirect(orderId, userId);
    return;
  }

  // New order arriving already cancelled/refunded → no stock action
  if (!oldStatus && isNowReleased) {
    return;
  }

  // Transition: reserved → delivered = commit (deduct from on-hand, clear reservation)
  if (wasReserved && isNowCommitted) {
    await commitStock(orderId, userId);
    return;
  }

  // Transition: reserved → cancelled/refunded = release reservation
  if (wasReserved && isNowReleased) {
    await releaseReservation(orderId, userId, "sale_cancel");
    return;
  }

  // Transition: delivered → returned = mark for admin inspection
  if (oldStatus === COMMIT_STATUS && isNowReturned) {
    await markReturned(orderId);
    return;
  }

  // Transition: any reserved → another reserved state = no-op (already reserved)
  // e.g. pending → processing, processing → shipped
  // Nothing to do here — reservation stays active
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Create reservations for all mapped items in the order.
 * Increments products.reservedQuantity atomically.
 */
async function reserveStock(orderId: number, userId: number): Promise<void> {
  const items = await getOrderItemsWithProducts(orderId);
  if (items.length === 0) return;

  let didAnyReservationSucceed = false;

  await db.transaction(async (tx) => {
    // 1. First, create reservations for any mapped items that don't have one yet
    for (const item of items) {
      if (!item.productId || item.quantity <= 0) continue;

      const [inserted] = await tx.insert(stockReservations).values({
        orderId,
        orderItemId: item.id,
        productId: item.productId,
        quantity: item.quantity,
        status: "active",
      }).onConflictDoNothing().returning({ id: stockReservations.id });

      // If this was a NEW reservation, we need to update stock and ledger
      if (inserted) {
        // Aggregate for this specific transaction batch
        await tx
          .update(products)
          .set({
            reservedQuantity: sql`${products.reservedQuantity} + ${item.quantity}`,
            updatedAt: new Date(),
          })
          .where(eq(products.id, item.productId));

        await tx.insert(inventoryTransactions).values({
          productId: item.productId,
          type: "sale_reserve",
          quantity: -item.quantity,
          referenceType: "sales_order",
          referenceId: orderId,
          createdBy: userId,
          notes: `Stock reserved for order #${orderId}`,
        });
        
        didAnyReservationSucceed = true;
      }
    }

    // 2. Check if the order is now FULLY processed
    // Fetch all items (including unmapped ones) to see if anything is left out
    const allItems = await tx
      .select({ productId: salesOrderItems.productId })
      .from(salesOrderItems)
      .where(eq(salesOrderItems.orderId, orderId));

    const isFullyMapped = allItems.every((it) => it.productId !== null);

    if (isFullyMapped) {
      await tx
        .update(salesOrders)
        .set({ stockProcessed: true })
        .where(eq(salesOrders.id, orderId));
    }
  });
}

/**
 * Commit stock for a delivered order: deduct from quantityOnHand + release reservation.
 * Called when an order transitions from reserved → delivered.
 */
async function commitStock(orderId: number, userId: number): Promise<void> {
  await db.transaction(async (tx) => {
    // Get active reservations for this order
    const reservations = await tx
      .select({
        id: stockReservations.id,
        productId: stockReservations.productId,
        quantity: stockReservations.quantity,
        orderItemId: stockReservations.orderItemId,
      })
      .from(stockReservations)
      .where(
        and(
          eq(stockReservations.orderId, orderId),
          eq(stockReservations.status, "active"),
        ),
      );

    // Aggregate reservations by product
    const totals = new Map<number, number>();
    for (const res of reservations) {
      totals.set(res.productId, (totals.get(res.productId) || 0) + res.quantity);
    }

    // Process aggregated stock updates and ledger entries
    for (const [productId, quantity] of totals.entries()) {
      // Deduct from on-hand stock
      await tx
        .update(products)
        .set({
          quantityOnHand: sql`GREATEST(0, ${products.quantityOnHand} - ${quantity})`,
          reservedQuantity: sql`GREATEST(0, ${products.reservedQuantity} - ${quantity})`,
          updatedAt: new Date(),
        })
        .where(eq(products.id, productId));

      // Log the transaction (consolidated)
      await tx.insert(inventoryTransactions).values({
        productId,
        type: "sale_out",
        quantity: -quantity,
        referenceType: "sales_order",
        referenceId: orderId,
        createdBy: userId,
        notes: `Stock committed — order #${orderId} delivered`,
      });
    }

    // Mark individual reservations as committed for history
    for (const res of reservations) {
      await tx
        .update(stockReservations)
        .set({ status: "committed", resolvedAt: new Date() })
        .where(eq(stockReservations.id, res.id));
    }
  });
}

/**
 * Commit directly for a new order arriving already as "delivered".
 * No intermediate reservation — just deduct from on-hand.
 */
async function commitStockDirect(orderId: number, userId: number): Promise<void> {
  const items = await getOrderItemsWithProducts(orderId);
  if (items.length === 0) return;

  await db.transaction(async (tx) => {
    // 1. Create individual reservations for audit trail
    // and deduct stock for newly discovered items
    for (const item of items) {
      if (!item.productId || item.quantity <= 0) continue;

      const [inserted] = await tx.insert(stockReservations).values({
        orderId,
        orderItemId: item.id,
        productId: item.productId,
        quantity: item.quantity,
        status: "committed",
        resolvedAt: new Date(),
      }).onConflictDoNothing().returning({ id: stockReservations.id });

      // If this was a NEW commit, update stock and ledger
      if (inserted) {
        await tx
          .update(products)
          .set({
            quantityOnHand: sql`GREATEST(0, ${products.quantityOnHand} - ${item.quantity})`,
            updatedAt: new Date(),
          })
          .where(eq(products.id, item.productId));

        // Log the transaction
        await tx.insert(inventoryTransactions).values({
          productId: item.productId,
          type: "sale_out",
          quantity: -item.quantity,
          referenceType: "sales_order",
          referenceId: orderId,
          createdBy: userId,
          notes: `Stock committed directly — order #${orderId} fetched as delivered`,
        });
      }
    }

    // 2. Check if the order is now FULLY processed
    const allItems = await tx
      .select({ productId: salesOrderItems.productId })
      .from(salesOrderItems)
      .where(eq(salesOrderItems.orderId, orderId));

    const isFullyMapped = allItems.every((it) => it.productId !== null);

    if (isFullyMapped) {
      await tx
        .update(salesOrders)
        .set({ stockProcessed: true })
        .where(eq(salesOrders.id, orderId));
    }
  });
}

/**
 * Release active reservations for a cancelled/refunded order.
 * Decrements products.reservedQuantity atomically.
 */
async function releaseReservation(
  orderId: number,
  userId: number,
  txType: "sale_cancel" | "return",
): Promise<void> {
  await db.transaction(async (tx) => {
    const reservations = await tx
      .select({
        id: stockReservations.id,
        productId: stockReservations.productId,
        quantity: stockReservations.quantity,
      })
      .from(stockReservations)
      .where(
        and(
          eq(stockReservations.orderId, orderId),
          eq(stockReservations.status, "active"),
        ),
      );

    // Aggregate reservations by product
    const totals = new Map<number, number>();
    for (const res of reservations) {
      totals.set(res.productId, (totals.get(res.productId) || 0) + res.quantity);
    }

    // Process aggregated stock updates and ledger entries
    for (const [productId, quantity] of totals.entries()) {
      // Release reserved quantity
      await tx
        .update(products)
        .set({
          reservedQuantity: sql`GREATEST(0, ${products.reservedQuantity} - ${quantity})`,
          updatedAt: new Date(),
        })
        .where(eq(products.id, productId));

      // Log the transaction (consolidated)
      await tx.insert(inventoryTransactions).values({
        productId,
        type: txType,
        quantity: quantity, // Positive = stock freed
        referenceType: "sales_order",
        referenceId: orderId,
        createdBy: userId,
        notes: `Reservation released — order #${orderId} ${txType === "sale_cancel" ? "cancelled" : "returned"}`,
      });
    }

    // Mark individual reservations as released
    for (const res of reservations) {
      await tx
        .update(stockReservations)
        .set({ status: "released", resolvedAt: new Date() })
        .where(eq(stockReservations.id, res.id));
    }
  });
}

/**
 * Mark a delivered order as returned — sets return disposition to pending_inspection.
 * Admin must then choose restock or discard for each item.
 */
async function markReturned(orderId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(salesOrders)
      .set({ returnDisposition: "pending_inspection" })
      .where(eq(salesOrders.id, orderId));

    // Mark all items as pending inspection
    const items = await tx
      .select({ id: salesOrderItems.id })
      .from(salesOrderItems)
      .where(eq(salesOrderItems.orderId, orderId));

    for (const item of items) {
      await tx
        .update(salesOrderItems)
        .set({ returnDisposition: "pending_inspection" })
        .where(eq(salesOrderItems.id, item.id));
    }
  });
}

// ─── Return Actions (Admin) ───────────────────────────────────────────────────

/**
 * Process a return action (restock or discard) for a specific order item.
 * Supports partial returns: admin can specify quantity.
 */
export async function processReturnItem(
  orderItemId: number,
  action: "restock" | "discard",
  quantity: number,
  userId: number,
  notes?: string,
): Promise<void> {
  // Strict server-side quantity validation
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(`Invalid return quantity: ${quantity}. Must be a positive integer.`);
  }

  await db.transaction(async (tx) => {
    const [item] = await tx
      .select({
        id: salesOrderItems.id,
        orderId: salesOrderItems.orderId,
        productId: salesOrderItems.productId,
        orderQty: salesOrderItems.quantity,
        returnQuantity: salesOrderItems.returnQuantity,
      })
      .from(salesOrderItems)
      .where(eq(salesOrderItems.id, orderItemId))
      .limit(1);

    if (!item) throw new Error("Order item not found");
    if (!item.productId) throw new Error("No product linked to this order item");

    const maxReturnable = item.orderQty - item.returnQuantity;
    if (quantity > maxReturnable) {
      throw new Error(`Cannot return ${quantity} — only ${maxReturnable} returnable`);
    }

    if (action === "restock") {
      // Add back to on-hand stock
      await tx
        .update(products)
        .set({
          quantityOnHand: sql`${products.quantityOnHand} + ${quantity}`,
          updatedAt: new Date(),
        })
        .where(eq(products.id, item.productId));

      await tx.insert(inventoryTransactions).values({
        productId: item.productId,
        type: "return_restock",
        quantity, // Positive = stock added back
        referenceType: "sales_order",
        referenceId: item.orderId,
        createdBy: userId,
        notes: notes || `Restocked ${quantity} unit(s) from return`,
      });
    } else {
      // Discard — stock is lost, record as negative for audit trail
      await tx.insert(inventoryTransactions).values({
        productId: item.productId,
        type: "return_discard",
        quantity: -quantity, // Negative = units lost/written off
        referenceType: "sales_order",
        referenceId: item.orderId,
        createdBy: userId,
        notes: notes || `Discarded ${quantity} unit(s) from return`,
      });
    }

    // Update the return tracking on the order item
    const newReturnQty = item.returnQuantity + quantity;
    const disposition = newReturnQty >= item.orderQty
      ? (action === "restock" ? "restocked" : "discarded")
      : "pending_inspection"; // Still more items to process

    await tx
      .update(salesOrderItems)
      .set({
        returnQuantity: newReturnQty,
        returnDisposition: disposition,
      })
      .where(eq(salesOrderItems.id, orderItemId));

    // Check if all items in the order are now fully processed
    const allItems = await tx
      .select({
        id: salesOrderItems.id,
        returnDisposition: salesOrderItems.returnDisposition,
      })
      .from(salesOrderItems)
      .where(eq(salesOrderItems.orderId, item.orderId));

    // Apply the disposition we just set for the current item (not yet committed)
    const itemDispositions = allItems.map((it) =>
      it.id === orderItemId ? disposition : it.returnDisposition,
    );

    const hasPending = itemDispositions.some((d) => d === "pending_inspection" || d === null);

    if (!hasPending) {
      // All items processed — compute aggregate disposition
      const allRestocked = itemDispositions.every((d) => d === "restocked");
      const allDiscarded = itemDispositions.every((d) => d === "discarded");
      const orderDisposition = allRestocked
        ? "restocked"
        : allDiscarded
          ? "discarded"
          : "completed"; // Mixed actions across items

      await tx
        .update(salesOrders)
        .set({ returnDisposition: orderDisposition })
        .where(eq(salesOrders.id, item.orderId));
    }
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Fetch order items that have a mapped SeplorX product. */
async function getOrderItemsWithProducts(orderId: number) {
  return db
    .select({
      id: salesOrderItems.id,
      productId: salesOrderItems.productId,
      quantity: salesOrderItems.quantity,
    })
    .from(salesOrderItems)
    .where(eq(salesOrderItems.orderId, orderId));
}
