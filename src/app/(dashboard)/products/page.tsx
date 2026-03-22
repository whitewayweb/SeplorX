import { getAuthenticatedUserId } from "@/lib/auth";
import { ProductList } from "@/components/organisms/products/product-list";
import { PageHeader } from "@/components/molecules/layout/page-header";
import { ProductDialog } from "@/components/organisms/products/product-dialog";
import { getProductsList } from "@/data/products";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Tags } from "lucide-react";

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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/products/attributes">
              <Tags className="mr-2 h-4 w-4" />
              Attributes
            </Link>
          </Button>
          <ProductDialog />
        </div>
      </PageHeader>

      <ProductList products={productList} />
    </div>
  );
}
