import { db } from "@/db";
import { products } from "@/db/schema";
import { getAuthenticatedUserId } from "@/lib/auth";
import { desc } from "drizzle-orm";
import { ProductList } from "@/components/organisms/products/product-list";
import { PageHeader } from "@/components/molecules/layout/page-header";
import { ProductDialog } from "@/components/organisms/products/product-dialog";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  await getAuthenticatedUserId();

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
      <PageHeader
        title="Products"
        description="Manage your product catalog and stock levels."
      >
        <ProductDialog />
      </PageHeader>

      <ProductList products={productList} />
    </div>
  );
}
