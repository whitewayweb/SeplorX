import { getAuthenticatedUserId } from "@/lib/auth";
import { ProductList } from "@/components/organisms/products/product-list";
import { PageHeader } from "@/components/molecules/layout/page-header";
import { ProductDialog } from "@/components/organisms/products/product-dialog";
import { getProductsList } from "@/data/products";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  await getAuthenticatedUserId();

  const productList = await getProductsList();

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
