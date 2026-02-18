import { db } from "@/db";
import { products } from "@/db/schema";
import { desc } from "drizzle-orm";
import { ProductList } from "@/components/products/product-list";
import { ProductDialog } from "@/components/products/product-dialog";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const productList = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      category: products.category,
      unit: products.unit,
      purchasePrice: products.purchasePrice,
      sellingPrice: products.sellingPrice,
      reorderLevel: products.reorderLevel,
      quantityOnHand: products.quantityOnHand,
      isActive: products.isActive,
    })
    .from(products)
    .orderBy(desc(products.createdAt));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground">
            Manage your product catalog and stock levels.
          </p>
        </div>
        <ProductDialog />
      </div>

      <ProductList products={productList} />
    </div>
  );
}
