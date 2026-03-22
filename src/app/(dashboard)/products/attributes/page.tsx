import { getAttributeKeys } from "@/app/(dashboard)/products/actions";
import { PageHeader } from "@/components/molecules/layout/page-header";
import { AttributeList } from "@/components/organisms/products/attribute-list";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AttributesPage() {
  const initialKeys = await getAttributeKeys();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Product Attributes"
        description="View and manage unique attributes extracted from your products."
      >
        <Button variant="outline" size="sm" asChild>
          <Link href="/products">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Products
          </Link>
        </Button>
      </PageHeader>

      <AttributeList initialKeys={initialKeys} />
    </div>
  );
}
