import { db } from "@/db";
import { companies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, MapPin, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompanyStatusBadge } from "@/components/companies/company-status-badge";
import { CompanyTypeBadge } from "@/components/companies/company-type-badge";
import { CompanyDialog } from "@/components/companies/company-dialog";

export const dynamic = "force-dynamic";

interface CompanyDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function CompanyDetailPage({ params }: CompanyDetailPageProps) {
  const { id } = await params;
  const companyId = parseInt(id, 10);

  if (isNaN(companyId)) {
    notFound();
  }

  const result = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (result.length === 0) {
    notFound();
  }

  const company = result[0];

  const addressParts = [company.address, company.city, company.state, company.pincode]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/companies">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                {company.name}
              </h1>
              <CompanyTypeBadge type={company.type} />
              <CompanyStatusBadge isActive={company.isActive} />
            </div>
            {company.contactPerson && (
              <p className="text-muted-foreground mt-1">
                Contact: {company.contactPerson}
              </p>
            )}
          </div>
        </div>
        <CompanyDialog company={company} />
      </div>

      {/* Details Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {company.email && (
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a
                  href={`mailto:${company.email}`}
                  className="text-sm hover:underline"
                >
                  {company.email}
                </a>
              </div>
            )}
            {company.phone && (
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <a
                  href={`tel:${company.phone}`}
                  className="text-sm hover:underline"
                >
                  {company.phone}
                </a>
              </div>
            )}
            {addressParts && (
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span className="text-sm">{addressParts}</span>
              </div>
            )}
            {!company.email && !company.phone && !addressParts && (
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
            {company.gstNumber && (
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">GST Number</p>
                  <p className="text-sm font-mono">{company.gstNumber}</p>
                </div>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Added</p>
              <p className="text-sm">
                {company.createdAt
                  ? new Date(company.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })
                  : "—"}
              </p>
            </div>
            {!company.gstNumber && (
              <p className="text-sm text-muted-foreground">
                No GST number provided.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        {company.notes && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{company.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
