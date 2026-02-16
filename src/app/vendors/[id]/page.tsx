import { db } from "@/db";
import { vendors } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, MapPin, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VendorStatusBadge } from "@/components/vendors/vendor-status-badge";
import { VendorDialog } from "@/components/vendors/vendor-dialog";

export const dynamic = "force-dynamic";

interface VendorDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function VendorDetailPage({ params }: VendorDetailPageProps) {
  const { id } = await params;
  const vendorId = parseInt(id, 10);

  if (isNaN(vendorId)) {
    notFound();
  }

  const result = await db
    .select()
    .from(vendors)
    .where(eq(vendors.id, vendorId))
    .limit(1);

  if (result.length === 0) {
    notFound();
  }

  const vendor = result[0];

  const addressParts = [vendor.address, vendor.city, vendor.state, vendor.pincode]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/vendors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                {vendor.name}
              </h1>
              <VendorStatusBadge isActive={vendor.isActive} />
            </div>
            {vendor.contactPerson && (
              <p className="text-muted-foreground mt-1">
                Contact: {vendor.contactPerson}
              </p>
            )}
          </div>
        </div>
        <VendorDialog vendor={vendor} />
      </div>

      {/* Details Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {vendor.email && (
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a
                  href={`mailto:${vendor.email}`}
                  className="text-sm hover:underline"
                >
                  {vendor.email}
                </a>
              </div>
            )}
            {vendor.phone && (
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <a
                  href={`tel:${vendor.phone}`}
                  className="text-sm hover:underline"
                >
                  {vendor.phone}
                </a>
              </div>
            )}
            {addressParts && (
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span className="text-sm">{addressParts}</span>
              </div>
            )}
            {!vendor.email && !vendor.phone && !addressParts && (
              <p className="text-sm text-muted-foreground">
                No contact information provided.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Business Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Business Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {vendor.gstNumber && (
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">GST Number</p>
                  <p className="text-sm font-mono">{vendor.gstNumber}</p>
                </div>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Added</p>
              <p className="text-sm">
                {vendor.createdAt
                  ? new Date(vendor.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })
                  : "—"}
              </p>
            </div>
            {!vendor.gstNumber && (
              <p className="text-sm text-muted-foreground">
                No GST number provided.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        {vendor.notes && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{vendor.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
